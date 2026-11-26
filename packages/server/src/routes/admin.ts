import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard, invalidateLeaderboardCache } from '../services/scoreService';
import { clearTeamRuntimeState } from '../services/zoneService';
import { asyncHandler, parsePositiveInt } from '../lib/asyncHandler';

const router = Router();
const VALID_PHOTO_STATUSES = new Set(['pending', 'approved', 'rejected']);

async function forceAdvanceTeamStage(teamId: number, gameId: number) {
  const activeProgress = await prisma.teamLevelProgress.findFirst({
    where: { teamId, completedAt: null },
    include: { level: true },
    orderBy: { stepNumber: 'desc' },
  });

  if (activeProgress) {
    await prisma.teamLevelProgress.update({
      where: { id: activeProgress.id },
      data: {
        completedAt: new Date(),
        completedBy: 'admin_override',
        locationReachedAt: activeProgress.locationReachedAt ?? new Date(),
      },
    });
  }

  const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, gameId);

  invalidateLeaderboardCache();
  const rankings = await buildLeaderboard(true);
  io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });
  io.emit('leaderboard:updated', { rankings });

  return { activeProgress, dispatch };
}

// List all teams
router.get(
  '/teams',
  requireAuth('admin'),
  asyncHandler(async (_req, res) => {
    const [teams, game] = await Promise.all([
      prisma.team.findMany({
        include: {
          levelProgress: { include: { level: true }, orderBy: { stepNumber: 'desc' } },
          penalties: true,
          locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
          teamPaths: { select: { id: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.game.findFirst({ orderBy: { id: 'desc' } }),
    ]);

    const [intermediateCount, hasFinal] = game
      ? await Promise.all([
          prisma.level.count({ where: { gameId: game.id, isFinal: false } }),
          prisma.level.findFirst({ where: { gameId: game.id, isFinal: true }, select: { id: true } }),
        ])
      : [0, null];

    const fallbackSteps = Math.max(1, Math.min(10, intermediateCount) + (hasFinal ? 1 : 0));

    res.json(
      teams.map((t) => ({
        ...t,
        totalSteps: t.teamPaths.length > 0 ? t.teamPaths.length + (hasFinal ? 1 : 0) : fallbackSteps,
      })),
    );
  }),
);

// Register a new team
router.post(
  '/teams',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { name, code, leaderName, mobile } = req.body as {
      name?: string;
      code?: string;
      leaderName?: string;
      mobile?: string;
    };
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim() : '';

    if (!trimmedName || !trimmedCode) {
      res.status(400).json({ error: 'Team name and access code are required' });
      return;
    }

    const allTeams = await prisma.team.findMany({ select: { id: true, name: true } });
    const existing = allTeams.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      res.status(409).json({ error: `Team "${trimmedName}" already exists` });
      return;
    }

    const hashedCode = await bcrypt.hash(trimmedCode, 10);
    const team = await prisma.team.create({
      data: {
        name: trimmedName,
        code: hashedCode,
        displayCode: trimmedCode,
        leaderName: leaderName?.trim() || null,
        mobile: mobile?.trim() || null,
      },
    });

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game && game.status === 'running') {
      const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
      await dispatchNextConflictFreeClue(io, team.id, game.id).catch(() => {});
    }

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) {
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    }

    res.status(201).json({ id: team.id, name: team.name, displayCode: team.displayCode, createdAt: team.createdAt });
  }),
);

// Update or reset access code for a team
router.patch(
  '/teams/:id/code',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const { code } = req.body as { code?: string };
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    let newCode = typeof code === 'string' ? code.trim() : '';
    if (!newCode) {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      let rand = '';
      for (let i = 0; i < 6; i++) {
        rand += chars[Math.floor(Math.random() * chars.length)];
      }
      newCode = rand;
    }

    if (newCode.length < 3 || newCode.length > 64) {
      res.status(400).json({ error: 'Access code must be 3-64 characters long' });
      return;
    }

    const hashedCode = await bcrypt.hash(newCode, 10);
    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        code: hashedCode,
        displayCode: newCode,
      },
    });

    await prisma.teamSession.updateMany({
      where: { teamId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.json({
      ok: true,
      teamId: updated.id,
      teamName: updated.name,
      displayCode: updated.displayCode,
    });
  }),
);

// Delete a team
router.delete(
  '/teams/:id',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const progIds = (
      await prisma.teamLevelProgress.findMany({ where: { teamId }, select: { id: true } })
    ).map((p) => p.id);

    await prisma.$transaction([
      prisma.teamSession.deleteMany({ where: { teamId } }),
      prisma.teamPath.deleteMany({ where: { teamId } }),
      ...(progIds.length > 0 ? [prisma.hintReveal.deleteMany({ where: { progressId: { in: progIds } } })] : []),
      prisma.teamLevelProgress.deleteMany({ where: { teamId } }),
      prisma.teamLocation.deleteMany({ where: { teamId } }),
      prisma.sosAlert.deleteMany({ where: { teamId } }),
      prisma.penalty.deleteMany({ where: { teamId } }),
      prisma.teamCheckpoint.deleteMany({ where: { teamId } }),
      prisma.photo.deleteMany({ where: { teamId } }),
      prisma.team.delete({ where: { id: teamId } }),
    ]);

    clearTeamRuntimeState(teamId);
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) {
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    }

    res.json({ ok: true, deletedTeamId: teamId });
  }),
);

// Reset progress for a specific team
router.post(
  '/teams/:id/reset',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const resetProgIds = (
      await prisma.teamLevelProgress.findMany({ where: { teamId }, select: { id: true } })
    ).map((p) => p.id);

    await prisma.$transaction([
      prisma.teamSession.updateMany({
        where: { teamId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.teamPath.deleteMany({ where: { teamId } }),
      ...(resetProgIds.length > 0 ? [prisma.hintReveal.deleteMany({ where: { progressId: { in: resetProgIds } } })] : []),
      prisma.teamLevelProgress.deleteMany({ where: { teamId } }),
      prisma.teamLocation.deleteMany({ where: { teamId } }),
      prisma.sosAlert.deleteMany({ where: { teamId } }),
      prisma.penalty.deleteMany({ where: { teamId } }),
      prisma.teamCheckpoint.deleteMany({ where: { teamId } }),
      prisma.photo.deleteMany({ where: { teamId } }),
      prisma.team.update({
        where: { id: teamId },
        data: { finishedAt: null },
      }),
    ]);

    clearTeamRuntimeState(teamId);

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game && (game.status === 'running' || game.status === 'paused')) {
      const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
      await dispatchNextConflictFreeClue(io, team.id, game.id).catch(() => {});
    }

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) {
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    }

    res.json({ ok: true, resetTeamId: teamId });
  }),
);

router.get(
  '/teams/:id/location',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const loc = await prisma.teamLocation.findFirst({
      where: { teamId },
      orderBy: { recordedAt: 'desc' },
    });
    res.json(loc ?? null);
  }),
);

// Verify team in-person finish
router.post(
  '/teams/:id/verify-finish',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { finishedAt: team.finishedAt ?? new Date() },
    });

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    const finishedRank = rankings.find((r) => r.teamId === teamId);

    if (game) {
      io.to(`game:${game.id}`).emit('winner:declared', {
        teamId,
        teamName: team.name,
        adjustedTimeSecs: finishedRank?.adjustedTimeSecs,
      });
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
      io.emit('leaderboard:updated', { rankings });
      io.to(`team:${teamId}`).emit('team:verified_finish', {
        finishedAt: updatedTeam.finishedAt,
        rank: finishedRank?.rank,
      });
    }

    res.json({ ok: true, team: updatedTeam, ranking: finishedRank });
  }),
);

// Admin emergency override: Bypass GPS check
router.post(
  '/teams/:id/bypass-gps',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    let activeProgress = await prisma.teamLevelProgress.findFirst({
      where: { teamId, completedAt: null },
      include: { level: true },
      orderBy: { stepNumber: 'desc' },
    });

    if (!activeProgress) {
      const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
      await dispatchNextConflictFreeClue(io, teamId, game.id);
      activeProgress = await prisma.teamLevelProgress.findFirst({
        where: { teamId, completedAt: null },
        include: { level: true },
        orderBy: { stepNumber: 'desc' },
      });
    }

    if (!activeProgress) {
      res.status(400).json({ error: 'Could not resolve active clue for team' });
      return;
    }

    const updatedProgress = await prisma.teamLevelProgress.update({
      where: { id: activeProgress.id },
      data: { locationReachedAt: activeProgress.locationReachedAt ?? new Date() },
      include: { level: true },
    });

    io.to(`team:${teamId}`).emit('clue:decrypted', {
      levelId: updatedProgress.levelId,
      stepNumber: updatedProgress.stepNumber,
      locationReachedAt: updatedProgress.locationReachedAt,
    });
    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: updatedProgress.levelId,
      stepNumber: updatedProgress.stepNumber,
      title: updatedProgress.level.title,
    });

    io.to('admin').emit('team:checkpoint_reached', {
      teamId,
      teamName: team.name,
      levelId: updatedProgress.levelId,
      levelTitle: updatedProgress.level.title,
      orderIndex: updatedProgress.level.orderIndex,
      reachedAt: updatedProgress.locationReachedAt,
      bypassedByAdmin: true,
    });

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

    res.json({
      ok: true,
      bypassed: true,
      stepNumber: updatedProgress.stepNumber,
      levelTitle: updatedProgress.level.title,
      locationReachedAt: updatedProgress.locationReachedAt,
    });
  }),
);

// Admin emergency override: Force complete current level and advance
router.post(
  '/teams/:id/force-advance',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    if (team.finishedAt) {
      res.status(400).json({ error: 'Team has already completed the hunt' });
      return;
    }

    const { activeProgress, dispatch } = await forceAdvanceTeamStage(teamId, game.id);
    res.json({
      ok: true,
      completedLevel: activeProgress?.level ?? null,
      nextStepNumber: dispatch.stepNumber,
      nextLevel: dispatch.nextLevel,
      finished: dispatch.finished,
    });
  }),
);

router.post(
  '/teams/:id/force-unlock',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    const { dispatch } = await forceAdvanceTeamStage(teamId, game.id);
    res.json({ ok: true, unlockedLevel: dispatch.nextLevel, stepNumber: dispatch.stepNumber, finished: dispatch.finished });
  }),
);

router.post(
  '/teams/:id/force-complete',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    const { activeProgress, dispatch } = await forceAdvanceTeamStage(teamId, game.id);
    res.json({ ok: true, completedLevel: activeProgress?.level, nextLevelId: dispatch.nextLevel?.id ?? null, finished: dispatch.finished });
  }),
);

// Jump team directly to any target stage (1 to totalSteps)
router.post(
  '/teams/:id/jump-stage',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const { targetStepNumber } = req.body as { targetStepNumber: number };
    const parsedStep = Number(targetStepNumber);

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    const { generateTeamPath, getTotalStepsForTeam, DEFAULT_INTERMEDIATE_STEPS, getCampusOccupancyMatrix } = await import('../services/dispatchService');
    await generateTeamPath(teamId, game.id, undefined, DEFAULT_INTERMEDIATE_STEPS);
    const totalSteps = await getTotalStepsForTeam(teamId, game.id);
    const maxStep = Math.max(1, totalSteps);

    if (!Number.isInteger(parsedStep) || parsedStep < 1 || parsedStep > maxStep) {
      res.status(400).json({ error: `targetStepNumber must be between 1 and ${maxStep}` });
      return;
    }

    await prisma.team.update({ where: { id: teamId }, data: { finishedAt: null } });

    await prisma.teamLevelProgress.updateMany({
      where: { teamId, completedAt: null },
      data: { completedAt: new Date(), completedBy: 'admin_override' },
    });

    await prisma.teamLevelProgress.deleteMany({
      where: { teamId, stepNumber: { gte: parsedStep } },
    });

    let targetLevel: any = null;
    const finaleLevel = await prisma.level.findFirst({ where: { gameId: game.id, isFinal: true } });

    if (finaleLevel && parsedStep === totalSteps) {
      targetLevel = finaleLevel;
    } else {
      const path = await prisma.teamPath.findUnique({
        where: { teamId_stepNumber: { teamId, stepNumber: parsedStep } },
        include: { level: true },
      });
      targetLevel = path?.level ?? null;
    }

    if (!targetLevel) {
      res.status(400).json({ error: 'Could not resolve target landmark for stage ' + parsedStep });
      return;
    }

    const newProgress = await prisma.teamLevelProgress.create({
      data: {
        teamId,
        levelId: targetLevel.id,
        stepNumber: parsedStep,
        unlockedAt: new Date(),
      },
    });

    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: targetLevel.id,
      stepNumber: parsedStep,
      totalSteps,
      title: targetLevel.title,
      isFinal: targetLevel.isFinal,
      unlockedAt: newProgress.unlockedAt,
    });

    io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(game.id));

    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    io.emit('leaderboard:updated', { rankings });

    res.json({
      ok: true,
      stepNumber: parsedStep,
      totalSteps,
      level: targetLevel,
    });
  }),
);

// Update campus map graphic settings
router.patch(
  '/map-settings',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { campusMapUrl, campusMapBounds } = req.body as {
      campusMapUrl?: string;
      campusMapBounds?: string;
    };
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (!game) { res.status(404).json({ error: 'No game' }); return; }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { campusMapUrl, campusMapBounds },
    });

    io.to(`game:${game.id}`).emit('game:map_updated', {
      campusMapUrl: updated.campusMapUrl,
      campusMapBounds: updated.campusMapBounds,
    });

    res.json(updated);
  }),
);

// Adjust team penalty or bonus minutes
router.post(
  '/teams/:id/penalty',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const teamId = parsePositiveInt(req.params.id);
    if (!teamId) { res.status(400).json({ error: 'Invalid team id' }); return; }

    const { minutes, kind, note } = req.body as { minutes: number; kind?: string; note?: string };
    const numMinutes = Number(minutes);
    if (minutes == null || !Number.isFinite(numMinutes)) {
      res.status(400).json({ error: 'Valid minutes required' });
      return;
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const penalty = await prisma.penalty.create({
      data: {
        teamId,
        kind: kind || (numMinutes > 0 ? 'admin_penalty' : 'admin_bonus'),
        minutes: Math.round(numMinutes),
        appliedAt: new Date(),
      },
    });

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) {
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
      io.emit('leaderboard:updated', { rankings });
      io.to(`team:${teamId}`).emit('team:penalty_applied', {
        minutes: Math.round(numMinutes),
        kind: penalty.kind,
        note,
      });
    }

    res.json({ ok: true, penalty, rankings });
  }),
);

// Get all uploaded photos
router.get(
  '/photos',
  requireAuth('admin'),
  asyncHandler(async (_req, res) => {
    const photos = await prisma.photo.findMany({
      include: { team: { select: { id: true, name: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(photos);
  }),
);

// Review photo (approve / reject)
router.patch(
  '/photos/:id',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const photoId = parsePositiveInt(req.params.id);
    if (!photoId) { res.status(400).json({ error: 'Invalid photo id' }); return; }

    const { status, reviewNote } = req.body as { status?: string; reviewNote?: string };
    if (!status || !VALID_PHOTO_STATUSES.has(status)) {
      res.status(400).json({ error: 'Status must be pending, approved, or rejected' });
      return;
    }

    const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: { team: true } });
    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    const updated = await prisma.photo.update({
      where: { id: photoId },
      data: {
        status,
        reviewNote: typeof reviewNote === 'string' && reviewNote.trim() ? reviewNote.trim() : null,
        reviewedAt: new Date(),
      },
      include: { team: true },
    });

    io.to(`team:${photo.teamId}`).emit('photo:reviewed', {
      id: updated.id,
      photoId,
      status: updated.status,
      reviewNote: updated.reviewNote,
      submittedAt: updated.submittedAt,
      reviewedAt: updated.reviewedAt,
    });

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (game) {
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    }

    res.json(updated);
  }),
);

// Quick aggregated game stats
router.get(
  '/stats',
  requireAuth('admin'),
  asyncHandler(async (_req, res) => {
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    const [totalTeams, finishedTeams, pendingPhotos, totalPenalties] = await Promise.all([
      prisma.team.count(),
      prisma.team.count({ where: { finishedAt: { not: null } } }),
      prisma.photo.count({ where: { status: 'pending' } }),
      prisma.penalty.count(),
    ]);

    let elapsedSecs = 0;
    if (game?.startedAt) {
      const end = game.endedAt ? game.endedAt.getTime() : (game.pausedAt ? game.pausedAt.getTime() : Date.now());
      elapsedSecs = Math.max(0, Math.floor((end - game.startedAt.getTime() - game.totalPausedMs) / 1000));
    }

    res.json({
      gameId: game?.id ?? null,
      gameStatus: game?.status ?? 'idle',
      elapsedSecs,
      totalTeams,
      finishedTeams,
      activeTeams: Math.max(0, totalTeams - finishedTeams),
      pendingPhotos,
      totalPenalties,
    });
  }),
);

export default router;
