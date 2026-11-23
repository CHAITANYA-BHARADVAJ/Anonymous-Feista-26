import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { photoUpload } from '../middleware/upload';
import { io } from '../index';
import { scheduleTeamLevelTimer } from '../services/timerService';
import { buildLeaderboard, invalidateLeaderboardCache } from '../services/scoreService';
import { dispatchNextConflictFreeClue } from '../services/dispatchService';

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

// Get current game state for participant
router.get('/game', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const game = await prisma.game.findFirst({
    orderBy: { id: 'desc' },
    include: { zones: { where: { active: true } } },
  });
  if (!game) { res.status(404).json({ error: 'No game found' }); return; }

  const progress = await prisma.teamLevelProgress.findMany({
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
    orderBy: { level: { orderIndex: 'asc' } },
  });

  res.json({ game, progress });
});

// Check GPS location and trigger clue drop
router.post('/levels/:id/reach-location', requireAuth('team'), async (req: AuthRequest, res) => {
  if (!(await checkGameRunning(res))) return;
  const teamId = req.user!.sub;
  const levelId = Number(req.params.id);
  const { lat, lng } = req.body as { lat?: number; lng?: number };

  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

  const progress = await prisma.teamLevelProgress.findUnique({
    where: { teamId_levelId: { teamId, levelId } },
  });
  if (!progress) { res.status(400).json({ error: 'Level not unlocked' }); return; }

  let distanceMeters = 0;
  const radius = (level.triggerRadiusMeters ?? 20) + 10; // 10m buffer for GPS jitter

  if (level.targetLat != null && level.targetLng != null) {
    if (lat == null || lng == null) {
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

  res.json({
    reached: true,
    distanceMeters: Math.round(distanceMeters),
    levelTitle: level.title,
    clueText: level.clueText,
    locationHint: level.locationHint,
  });
});

// Submit level answer
router.post('/levels/:id/answer', requireAuth('team'), async (req: AuthRequest, res) => {
  if (!(await checkGameRunning(res))) return;
  const teamId = req.user!.sub;
  const levelId = Number(req.params.id);
  const { answer } = req.body as { answer: string };

  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

  const progress = await prisma.teamLevelProgress.findUnique({
    where: { teamId_levelId: { teamId, levelId } },
  });
  if (!progress) { res.status(400).json({ error: 'Level not unlocked' }); return; }
  if (progress.completedAt) { res.status(400).json({ error: 'Level already completed' }); return; }

  // If level requires answer verification
  if (level.answer && level.answer.trim()) {
    const correct = answer?.trim().toLowerCase() === level.answer.trim().toLowerCase();
    if (!correct) { res.status(422).json({ error: 'Incorrect answer', correct: false }); return; }
  }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });

  await prisma.teamLevelProgress.update({
    where: { id: progress.id },
    data: { completedAt: new Date(), completedBy: 'answer' },
  });

  // Dynamically assign next conflict-free clue (or Grand Finale at step 10)
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, level.gameId);

  // Update leaderboard
  invalidateLeaderboardCache();
  const rankings = await buildLeaderboard(true);
  if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({
    correct: true,
    nextLevelId: dispatch.nextLevel?.id ?? null,
    stepNumber: dispatch.stepNumber,
    finished: dispatch.finished,
  });
});

// Reveal hint
router.post('/levels/:id/hints/:hintOrder/reveal', requireAuth('team'), async (req: AuthRequest, res) => {
  if (!(await checkGameRunning(res))) return;
  const teamId = req.user!.sub;
  const levelId = Number(req.params.id);
  const hintOrder = Number(req.params.hintOrder);

  const progress = await prisma.teamLevelProgress.findUnique({
    where: { teamId_levelId: { teamId, levelId } },
    include: { hintReveals: true },
  });
  if (!progress || progress.completedAt) {
    res.status(400).json({ error: 'Level not active' }); return;
  }

  const hint = await prisma.hint.findFirst({ where: { levelId, orderIndex: hintOrder } });
  if (!hint) { res.status(404).json({ error: 'Hint not found' }); return; }

  const alreadyRevealed = progress.hintReveals.some((r) => r.hintId === hint.id);
  if (alreadyRevealed) { res.status(400).json({ error: 'Hint already revealed' }); return; }

  if (progress.hintsUsed >= 3) { res.status(400).json({ error: 'Max hints used' }); return; }

  // Check if free hint from checkpoint
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

  res.json({ text: hint.text, penaltyMins: useFreeHint ? 0 : hint.penaltyMins });
  invalidateLeaderboardCache();
});

// Claim checkpoint
router.post('/checkpoints/:id/claim', requireAuth('team'), async (req: AuthRequest, res) => {
  if (!(await checkGameRunning(res))) return;
  const teamId = req.user!.sub;
  const checkpointId = Number(req.params.id);
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
});

// Upload verification photo
router.post('/photos', requireAuth('team'), photoUpload.single('photo'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  if (!req.file) {
    res.status(400).json({ error: 'Photo image file is required' });
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

  io.to('admin').emit('admin:photo_submitted', { photo });
  res.status(201).json(photo);
});

export default router;
