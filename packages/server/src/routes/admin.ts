import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard } from '../services/scoreService';

const router = Router();

// List all teams
router.get('/teams', requireAuth('admin'), async (_req, res) => {
  const teams = await prisma.team.findMany({
    include: {
      levelProgress: { include: { level: true }, orderBy: { level: { orderIndex: 'desc' } } },
      penalties: true,
      locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
    orderBy: { id: 'asc' },
  });
  res.json(teams);
});

// Register a new team
router.post('/teams', requireAuth('admin'), async (req, res) => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name || !name.trim() || !code || !code.trim()) {
    res.status(400).json({ error: 'Team name and access code are required' });
    return;
  }

  const trimmedName = name.trim();
  const trimmedCode = code.trim();

  const existing = await prisma.team.findUnique({ where: { name: trimmedName } });
  if (existing) {
    res.status(409).json({ error: `Team "${trimmedName}" already exists` });
    return;
  }

  const hashedCode = await bcrypt.hash(trimmedCode, 10);
  const team = await prisma.team.create({
    data: {
      name: trimmedName,
      code: hashedCode,
    },
  });

  // If a game is currently running, unlock step 1 immediately for this newly registered team
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game && game.status === 'running') {
    const { generateTeamPath } = await import('../services/dispatchService');
    const paths = await generateTeamPath(team.id, game.id);
    if (paths.length > 0) {
      await prisma.teamLevelProgress.create({
        data: { teamId: team.id, levelId: paths[0].levelId, stepNumber: 1, unlockedAt: new Date() },
      });
    }
  }

  const rankings = await buildLeaderboard();
  if (game) {
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  }

  res.status(201).json({ id: team.id, name: team.name, createdAt: team.createdAt });
});

// Delete a team
router.delete('/teams/:id', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  // Delete all cascades
  await prisma.teamSession.deleteMany({ where: { teamId } });
  await prisma.teamPath.deleteMany({ where: { teamId } });
  const progIds = (await prisma.teamLevelProgress.findMany({ where: { teamId }, select: { id: true } })).map((p) => p.id);
  await prisma.hintReveal.deleteMany({ where: { progressId: { in: progIds } } });
  await prisma.teamLevelProgress.deleteMany({ where: { teamId } });
  await prisma.teamLocation.deleteMany({ where: { teamId } });
  await prisma.sosAlert.deleteMany({ where: { teamId } });
  await prisma.penalty.deleteMany({ where: { teamId } });
  await prisma.teamCheckpoint.deleteMany({ where: { teamId } });
  await prisma.photo.deleteMany({ where: { teamId } });

  await prisma.team.delete({ where: { id: teamId } });

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const rankings = await buildLeaderboard();
  if (game) {
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  }

  res.json({ ok: true, deletedTeamId: teamId });
});

// Reset progress for a specific team
router.post('/teams/:id/reset', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  await prisma.teamSession.updateMany({
    where: { teamId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.teamPath.deleteMany({ where: { teamId } });
  const resetProgIds = (await prisma.teamLevelProgress.findMany({ where: { teamId }, select: { id: true } })).map((p) => p.id);
  await prisma.hintReveal.deleteMany({ where: { progressId: { in: resetProgIds } } });
  await prisma.teamLevelProgress.deleteMany({ where: { teamId } });
  await prisma.teamLocation.deleteMany({ where: { teamId } });
  await prisma.sosAlert.deleteMany({ where: { teamId } });
  await prisma.penalty.deleteMany({ where: { teamId } });
  await prisma.teamCheckpoint.deleteMany({ where: { teamId } });

  await prisma.team.update({
    where: { id: teamId },
    data: { finishedAt: null },
  });

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game && (game.status === 'running' || game.status === 'paused')) {
    const { generateTeamPath } = await import('../services/dispatchService');
    const paths = await generateTeamPath(team.id, game.id);
    if (paths.length > 0) {
      await prisma.teamLevelProgress.create({
        data: { teamId: team.id, levelId: paths[0].levelId, stepNumber: 1, unlockedAt: new Date() },
      });
    }
  }

  const rankings = await buildLeaderboard();
  if (game) {
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  }

  res.json({ ok: true, resetTeamId: teamId });
});

router.get('/teams/:id/location', requireAuth('admin'), async (req, res) => {
  const loc = await prisma.teamLocation.findFirst({
    where: { teamId: Number(req.params.id) },
    orderBy: { recordedAt: 'desc' },
  });
  res.json(loc ?? null);
});

// Verify team in-person finish (after they show photo at start venue)
router.post('/teams/:id/verify-finish', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const updatedTeam = await prisma.team.update({
    where: { id: teamId },
    data: { finishedAt: new Date() },
  });

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const rankings = await buildLeaderboard();
  const finishedRank = rankings.find((r) => r.teamId === teamId);

  if (game) {
    io.to(`game:${game.id}`).emit('winner:declared', {
      teamId,
      teamName: team.name,
      adjustedTimeSecs: finishedRank?.adjustedTimeSecs,
    });
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    io.to(`team:${teamId}`).emit('team:verified_finish', {
      finishedAt: updatedTeam.finishedAt,
      rank: finishedRank?.rank,
    });
  }

  res.json({ ok: true, team: updatedTeam, ranking: finishedRank });
});

// Admin emergency override: Force unlock next level for team
router.post('/teams/:id/force-unlock', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

  const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, game.id);

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ ok: true, unlockedLevel: dispatch.nextLevel, stepNumber: dispatch.stepNumber, finished: dispatch.finished });
});

// Admin emergency override: Force complete current level for team
router.post('/teams/:id/force-complete', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

  const activeProgress = await prisma.teamLevelProgress.findFirst({
    where: { teamId, completedAt: null },
    include: { level: true },
    orderBy: { stepNumber: 'asc' },
  });

  if (!activeProgress) {
    res.status(400).json({ error: 'No active level in progress for team' });
    return;
  }

  await prisma.teamLevelProgress.update({
    where: { id: activeProgress.id },
    data: { completedAt: new Date(), completedBy: 'admin_override' },
  });

  const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, game.id);

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ ok: true, completedLevel: activeProgress.level, nextLevelId: dispatch.nextLevel?.id ?? null, finished: dispatch.finished });
});

// Update campus map graphic settings
router.patch('/map-settings', requireAuth('admin'), async (req, res) => {
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
});

// Adjust team penalty or bonus minutes
router.post('/teams/:id/penalty', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const { minutes, kind, note } = req.body as { minutes: number; kind?: string; note?: string };
  if (minutes == null || isNaN(Number(minutes))) {
    res.status(400).json({ error: 'Valid minutes required' });
    return;
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const numMinutes = Number(minutes);
  const penalty = await prisma.penalty.create({
    data: {
      teamId,
      kind: kind || (numMinutes > 0 ? 'admin_penalty' : 'admin_bonus'),
      minutes: numMinutes,
      appliedAt: new Date(),
    },
  });

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const rankings = await buildLeaderboard();
  if (game) {
    io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    io.to(`team:${teamId}`).emit('team:penalty_applied', {
      minutes: numMinutes,
      kind: penalty.kind,
      note,
    });
  }

  res.json({ ok: true, penalty, rankings });
});

// Get all uploaded photos
router.get('/photos', requireAuth('admin'), async (_req, res) => {
  const photos = await prisma.photo.findMany({
    include: { team: { select: { id: true, name: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  res.json(photos);
});

// Review photo (approve / reject)
router.patch('/photos/:id', requireAuth('admin'), async (req, res) => {
  const photoId = Number(req.params.id);
  const { status, reviewNote } = req.body as { status: string; reviewNote?: string };

  const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: { team: true } });
  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  const updated = await prisma.photo.update({
    where: { id: photoId },
    data: {
      status,
      reviewNote: reviewNote ?? null,
      reviewedAt: new Date(),
    },
    include: { team: true },
  });

  io.to(`team:${photo.teamId}`).emit('photo:reviewed', {
    photoId,
    status,
    reviewNote,
  });

  res.json(updated);
});

// List SOS alerts
router.get('/sos', requireAuth('admin'), async (_req, res) => {
  const alerts = await prisma.sosAlert.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { sentAt: 'desc' },
  });
  res.json(alerts);
});

// Resolve / acknowledge an SOS alert
router.post('/sos/:id/resolve', requireAuth('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.sosAlert.delete({ where: { id } });
    io.to('admin').emit('sos:resolved', { id });
    res.json({ ok: true, resolvedId: id });
  } catch {
    res.status(404).json({ error: 'Alert not found or already resolved' });
  }
});

// Delete SOS alert (alias)
router.delete('/sos/:id', requireAuth('admin'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.sosAlert.delete({ where: { id } });
    io.to('admin').emit('sos:resolved', { id });
    res.json({ ok: true, resolvedId: id });
  } catch {
    res.status(404).json({ error: 'Alert not found or already resolved' });
  }
});

// Quick aggregated game stats
router.get('/stats', requireAuth('admin'), async (_req, res) => {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const [totalTeams, finishedTeams, activeSos, pendingPhotos, totalPenalties] = await Promise.all([
    prisma.team.count(),
    prisma.team.count({ where: { finishedAt: { not: null } } }),
    prisma.sosAlert.count(),
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
    activeSos,
    pendingPhotos,
    totalPenalties,
  });
});

export default router;
