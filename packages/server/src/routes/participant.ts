import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { photoUpload } from '../middleware/upload';
import { io } from '../index';
import { buildLeaderboard, invalidateLeaderboardCache } from '../services/scoreService';
import { dispatchNextConflictFreeClue, getTotalStepsForTeam } from '../services/dispatchService';
import { asyncHandler, parsePositiveInt } from '../lib/asyncHandler';

const router = Router();

async function checkGameRunning(res: any): Promise<boolean> {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game || game.status !== 'running') {
    res.status(403).json({
      error: game?.status === 'paused'
        ? 'Hunt is temporarily PAUSED by Event Control. Field operations and timers are frozen.'
        : game?.status === 'ended'
        ? 'Hunt has officially CONCLUDED. Please report to the start venue.'
        : 'Hunt has not started yet. Standby for official launch.',
      status: game?.status ?? 'idle',
    });
    return false;
  }
  return true;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Full Fog-of-War Sanitizer:
 * - Never exposes `level.answer` (returns `requiresAnswer` boolean instead)
 * - Hides `clueText`, `socialLinks`, `hints`, and `checkpoints` until GPS arrival (or completion)
 * - Strips `hint.text` from any unrevealed hint so players cannot inspect DevTools for free hints
 */
function sanitizeProgressEntry(p: any, freeHintCredits: number) {
  const level = p.level;
  const hasGpsTarget = level.targetLat != null && level.targetLng != null;
  const isUnlockedForIntel = !hasGpsTarget || Boolean(p.locationReachedAt) || Boolean(p.completedAt);
  const revealedIds = new Set((p.hintReveals ?? []).map((hr: any) => hr.hintId));
  const freeHintsRemaining = Math.max(0, freeHintCredits - (p.hintReveals?.length ?? 0));

  return {
    id: p.id,
    teamId: p.teamId,
    levelId: p.levelId,
    stepNumber: p.stepNumber,
    unlockedAt: p.unlockedAt,
    locationReachedAt: p.locationReachedAt,
    completedAt: p.completedAt,
    completedBy: p.completedBy,
    hintsUsed: p.hintsUsed,
    freeHintsRemaining,
    hintReveals: p.hintReveals,
    level: {
      id: level.id,
      gameId: level.gameId,
      orderIndex: level.orderIndex,
      title: level.title,
      clueText: isUnlockedForIntel ? level.clueText : '',
      clueLocked: !isUnlockedForIntel,
      locationHint: level.locationHint,
      requiresAnswer: Boolean(level.answer && level.answer.trim()),
      durationSecs: level.durationSecs,
      isFinal: level.isFinal,
      targetLat: level.targetLat,
      targetLng: level.targetLng,
      triggerRadiusMeters: level.triggerRadiusMeters,
      mapOverlayGeoJson: level.mapOverlayGeoJson,
      socialLinks: isUnlockedForIntel ? level.socialLinks : [],
      hints: isUnlockedForIntel
        ? (level.hints ?? []).map((h: any) => ({
            id: h.id,
            orderIndex: h.orderIndex,
            penaltyMins: h.penaltyMins,
            revealed: revealedIds.has(h.id),
            ...(revealedIds.has(h.id) ? { text: h.text } : {}),
          }))
        : [],
      checkpoints: isUnlockedForIntel
        ? (level.checkpoints ?? []).map((cp: any) => ({
            id: cp.id,
            kind: cp.kind,
            questionText: cp.questionText,
            rewardKind: cp.rewardKind,
            rewardValue: cp.rewardValue,
          }))
        : [],
    },
  };
}

// Get current game state for participant
router.get(
  '/game',
  requireAuth('team'),
  asyncHandler(async (req: AuthRequest, res) => {
    const teamId = req.user!.sub;
    const game = await prisma.game.findFirst({
      orderBy: { id: 'desc' },
      include: { zones: { where: { active: true } } },
    });
    if (!game) { res.status(404).json({ error: 'No game found' }); return; }

    const [progress, totalSteps, latestPhoto, freeHintClaims] = await Promise.all([
      prisma.teamLevelProgress.findMany({
        where: { teamId },
        include: {
          level: {
            include: {
              socialLinks: true,
              hints: { orderBy: { orderIndex: 'asc' } },
              checkpoints: true,
            },
          },
          hintReveals: true,
        },
        orderBy: { stepNumber: 'asc' },
      }),
      getTotalStepsForTeam(teamId, game.id),
      game.startedAt
        ? prisma.photo.findFirst({
            where: { teamId, submittedAt: { gte: game.startedAt } },
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              status: true,
              reviewNote: true,
              submittedAt: true,
              reviewedAt: true,
            },
          })
        : Promise.resolve(null),
      prisma.teamCheckpoint.findMany({
        where: { teamId, checkpoint: { rewardKind: 'free_hint' } },
        include: { checkpoint: { select: { levelId: true } } },
      }),
    ]);

    const freeCreditsByLevel = new Map<number, number>();
    for (const c of freeHintClaims) {
      freeCreditsByLevel.set(
        c.checkpoint.levelId,
        (freeCreditsByLevel.get(c.checkpoint.levelId) ?? 0) + 1,
      );
    }

    const sanitizedProgress = progress.map((p) =>
      sanitizeProgressEntry(p, freeCreditsByLevel.get(p.levelId) ?? 0),
    );

    res.json({ game, progress: sanitizedProgress, totalSteps, latestPhoto });
  }),
);

// Check GPS location and trigger clue drop
router.post(
  '/levels/:id/reach-location',
  requireAuth('team'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await checkGameRunning(res))) return;
    const teamId = req.user!.sub;
    const levelId = parsePositiveInt(req.params.id);
    if (!levelId) { res.status(400).json({ error: 'Invalid level id' }); return; }

    const { lat, lng } = req.body as { lat?: number; lng?: number };

    const level = await prisma.level.findUnique({
      where: { id: levelId },
      include: { socialLinks: true, hints: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

    const progress = await prisma.teamLevelProgress.findUnique({
      where: { teamId_levelId: { teamId, levelId } },
      include: { hintReveals: true },
    });
    if (!progress) { res.status(400).json({ error: 'Level not unlocked' }); return; }

    let distanceMeters = 0;
    const radius = (level.triggerRadiusMeters ?? 20) + 10; // 10m buffer for GPS jitter

    if (level.targetLat != null && level.targetLng != null) {
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        res.status(400).json({ error: 'Device GPS coordinates required' });
        return;
      }
      distanceMeters = getDistanceMeters(lat, lng, level.targetLat, level.targetLng);
      if (distanceMeters > radius) {
        res.status(400).json({
          error: `You are ${Math.round(distanceMeters)}m away. Move within ${level.triggerRadiusMeters ?? 20}m to unlock this clue!`,
          distanceMeters: Math.round(distanceMeters),
          triggerRadius: level.triggerRadiusMeters ?? 20,
        });
        return;
      }
    }

    const updatedProgress = await prisma.teamLevelProgress.update({
      where: { id: progress.id },
      data: { locationReachedAt: progress.locationReachedAt ?? new Date() },
    });

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    io.to('admin').emit('team:checkpoint_reached', {
      teamId,
      teamName: team?.name,
      levelId,
      levelTitle: level.title,
      orderIndex: level.orderIndex,
      reachedAt: updatedProgress.locationReachedAt,
    });

    const revealedIds = new Set(progress.hintReveals.map((r) => r.hintId));

    res.json({
      reached: true,
      distanceMeters: Math.round(distanceMeters),
      levelTitle: level.title,
      clueText: level.clueText,
      locationHint: level.locationHint,
      socialLinks: level.socialLinks,
      hints: level.hints.map((h) => ({
        id: h.id,
        orderIndex: h.orderIndex,
        penaltyMins: h.penaltyMins,
        revealed: revealedIds.has(h.id),
        ...(revealedIds.has(h.id) ? { text: h.text } : {}),
      })),
    });
  }),
);

// Submit level answer
router.post(
  '/levels/:id/answer',
  requireAuth('team'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await checkGameRunning(res))) return;
    const teamId = req.user!.sub;
    const levelId = parsePositiveInt(req.params.id);
    if (!levelId) { res.status(400).json({ error: 'Invalid level id' }); return; }

    const { answer } = req.body as { answer?: string };

    const level = await prisma.level.findUnique({ where: { id: levelId } });
    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

    const progress = await prisma.teamLevelProgress.findUnique({
      where: { teamId_levelId: { teamId, levelId } },
    });
    if (!progress) { res.status(400).json({ error: 'Level not unlocked' }); return; }
    if (progress.completedAt) { res.status(400).json({ error: 'Level already completed' }); return; }

    if (level.targetLat != null && level.targetLng != null && !progress.locationReachedAt) {
      res.status(403).json({ error: 'Reach the target landmark perimeter before submitting your solution.' });
      return;
    }

    if (level.answer && level.answer.trim()) {
      const normalize = (s: string) => {
        const base = s.trim().toLowerCase().replace(/\s+/g, ' ');
        return level.isFinal ? base.replace(/[!?.]+$/, '') : base;
      };
      const correct = normalize(typeof answer === 'string' ? answer : '') === normalize(level.answer);
      if (!correct) { res.status(422).json({ error: 'Incorrect answer', correct: false }); return; }
    }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });

    await prisma.teamLevelProgress.update({
      where: { id: progress.id },
      data: { completedAt: new Date(), completedBy: 'answer' },
    });

    const dispatch = await dispatchNextConflictFreeClue(io, teamId, level.gameId);

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

    res.json({
      correct: true,
      nextLevelId: dispatch.nextLevel?.id ?? null,
      stepNumber: dispatch.stepNumber,
      totalSteps: dispatch.totalSteps,
      isFinal: Boolean(dispatch.nextLevel?.isFinal),
      finished: dispatch.finished,
    });
  }),
);

// Reveal hint
router.post(
  '/levels/:id/hints/:hintOrder/reveal',
  requireAuth('team'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await checkGameRunning(res))) return;
    const teamId = req.user!.sub;
    const levelId = parsePositiveInt(req.params.id);
    const hintOrder = parsePositiveInt(req.params.hintOrder);
    if (!levelId || !hintOrder) { res.status(400).json({ error: 'Invalid level or hint parameter' }); return; }

    const [level, progress] = await Promise.all([
      prisma.level.findUnique({ where: { id: levelId } }),
      prisma.teamLevelProgress.findUnique({
        where: { teamId_levelId: { teamId, levelId } },
        include: { hintReveals: true },
      }),
    ]);
    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }
    if (!progress || progress.completedAt) {
      res.status(400).json({ error: 'Level not active' }); return;
    }

    if (level.targetLat != null && level.targetLng != null && !progress.locationReachedAt) {
      res.status(403).json({ error: 'Reach the target landmark perimeter before unlocking tactical hints.' });
      return;
    }

    const hint = await prisma.hint.findFirst({ where: { levelId, orderIndex: hintOrder } });
    if (!hint) { res.status(404).json({ error: 'Hint not found' }); return; }

    const alreadyRevealed = progress.hintReveals.some((r) => r.hintId === hint.id);
    if (alreadyRevealed) { res.status(400).json({ error: 'Hint already revealed' }); return; }
    if (progress.hintsUsed >= 3) { res.status(400).json({ error: 'Max hints used' }); return; }

    const freeHints = await prisma.teamCheckpoint.count({
      where: {
        teamId,
        checkpoint: { rewardKind: 'free_hint', levelId },
      },
    });
    const paidHintsUsed = progress.hintReveals.length;
    const useFreeHint = paidHintsUsed < freeHints;

    await prisma.$transaction([
      prisma.hintReveal.create({
        data: { progressId: progress.id, hintId: hint.id, revealedAt: new Date() },
      }),
      prisma.teamLevelProgress.update({
        where: { id: progress.id },
        data: { hintsUsed: { increment: 1 } },
      }),
      ...(useFreeHint
        ? []
        : [
            prisma.penalty.create({
              data: { teamId, kind: 'hint', minutes: hint.penaltyMins, appliedAt: new Date() },
            }),
          ]),
    ]);

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    io.to(`game:${level.gameId}`).emit('leaderboard:updated', { rankings });

    res.json({ text: hint.text, penaltyMins: useFreeHint ? 0 : hint.penaltyMins });
  }),
);

// Claim checkpoint
router.post(
  '/checkpoints/:id/claim',
  requireAuth('team'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await checkGameRunning(res))) return;
    const teamId = req.user!.sub;
    const checkpointId = parsePositiveInt(req.params.id);
    if (!checkpointId) { res.status(400).json({ error: 'Invalid checkpoint id' }); return; }

    const { qrPayload, answer } = req.body as { qrPayload?: string; answer?: string };

    const cp = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
    if (!cp) { res.status(404).json({ error: 'Not found' }); return; }

    const existing = await prisma.teamCheckpoint.findUnique({
      where: { teamId_checkpointId: { teamId, checkpointId } },
    });
    if (existing) { res.status(400).json({ error: 'Already claimed' }); return; }

    if (cp.kind === 'qr' && qrPayload?.trim() !== cp.qrPayload?.trim()) {
      res.status(422).json({ error: 'Invalid QR code' }); return;
    }
    if (cp.kind === 'question' && answer?.trim().toLowerCase() !== cp.answer?.trim().toLowerCase()) {
      res.status(422).json({ error: 'Incorrect answer' }); return;
    }

    await prisma.teamCheckpoint.create({ data: { teamId, checkpointId, claimedAt: new Date() } });

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

    res.json({ rewardKind: cp.rewardKind, rewardValue: cp.rewardValue });
  }),
);

// Upload verification photo (requires running game AND team at Finale or finished)
router.post(
  '/photos',
  requireAuth('team'),
  photoUpload.single('photo'),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!(await checkGameRunning(res))) return;

    const teamId = req.user!.sub;
    if (!req.file) {
      res.status(400).json({ error: 'Photo image file is required' });
      return;
    }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    const [team, progressList, hasFinaleInGame] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId }, select: { finishedAt: true } }),
      prisma.teamLevelProgress.findMany({
        where: { teamId },
        include: { level: { select: { isFinal: true } } },
      }),
      game
        ? prisma.level.findFirst({ where: { gameId: game.id, isFinal: true }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    const unlockedFinale = progressList.some((p) => p.level.isFinal);
    const totalSteps = game ? await getTotalStepsForTeam(teamId, game.id) : progressList.length;
    const atFinalStepWithoutFlag = !hasFinaleInGame && progressList.some((p) => p.stepNumber >= totalSteps);

    if (!team?.finishedAt && !unlockedFinale && !atFinalStepWithoutFlag) {
      res.status(403).json({ error: 'Victory photo uploads unlock once your squad reaches the Final Location.' });
      return;
    }

    const relativePath = `/uploads/${teamId}/${req.file.filename}`;
    const photo = await prisma.photo.create({
      data: {
        teamId,
        filePath: relativePath,
        submittedAt: new Date(),
        status: 'pending',
      },
      include: { team: { select: { id: true, name: true } } },
    });

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    io.to('admin').emit('admin:photo_submitted', { photo });
    res.status(201).json(photo);
  }),
);

export default router;
