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

  // If a game is currently running, unlock level 1 immediately for this newly registered team
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game && game.status === 'running') {
    const level1 = await prisma.level.findFirst({ where: { gameId: game.id, orderIndex: 1 } });
    if (level1) {
      await prisma.teamLevelProgress.create({
        data: { teamId: team.id, levelId: level1.id, unlockedAt: new Date() },
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
    const level1 = await prisma.level.findFirst({ where: { gameId: game.id, orderIndex: 1 } });
    if (level1) {
      await prisma.teamLevelProgress.create({
        data: { teamId: team.id, levelId: level1.id, unlockedAt: new Date() },
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

  // Get current highest level for team
  const progress = await prisma.teamLevelProgress.findMany({
    where: { teamId },
    include: { level: true },
    orderBy: { level: { orderIndex: 'desc' } },
  });

  const currentOrder = progress[0]?.level?.orderIndex ?? 0;
  const nextLevel = await prisma.level.findFirst({
    where: { gameId: game.id, orderIndex: currentOrder + 1 },
  });

  if (!nextLevel) {
    res.status(400).json({ error: 'No further levels to unlock' });
    return;
  }

  const newProgress = await prisma.teamLevelProgress.upsert({
    where: { teamId_levelId: { teamId, levelId: nextLevel.id } },
    update: { unlockedAt: new Date() },
    create: { teamId, levelId: nextLevel.id, unlockedAt: new Date() },
  });

  io.to(`team:${teamId}`).emit('level:unlocked', {
    levelId: nextLevel.id,
    orderIndex: nextLevel.orderIndex,
    unlockedAt: newProgress.unlockedAt,
  });

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ ok: true, unlockedLevel: nextLevel });
});

// Admin emergency override: Force complete current level for team
router.post('/teams/:id/force-complete', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

  const activeProgress = await prisma.teamLevelProgress.findFirst({
    where: { teamId, completedAt: null },
    include: { level: true },
    orderBy: { level: { orderIndex: 'asc' } },
  });

  if (!activeProgress) {
    res.status(400).json({ error: 'No active level in progress for team' });
    return;
  }

  await prisma.teamLevelProgress.update({
    where: { id: activeProgress.id },
    data: { completedAt: new Date(), completedBy: 'admin_override' },
  });

  // Unlock next
  const nextLevel = await prisma.level.findFirst({
    where: { gameId: game.id, orderIndex: activeProgress.level.orderIndex + 1 },
  });

  if (nextLevel) {
    const nextProg = await prisma.teamLevelProgress.create({
      data: { teamId, levelId: nextLevel.id, unlockedAt: new Date() },
    });
    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: nextLevel.id,
      orderIndex: nextLevel.orderIndex,
      unlockedAt: nextProg.unlockedAt,
    });
  }

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ ok: true, completedLevel: activeProgress.level, nextLevelId: nextLevel?.id ?? null });
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

router.get('/photos', requireAuth('admin'), async (_req, res) => {
  res.json([]);
});

router.patch('/photos/:id', requireAuth('admin'), async (_req, res) => {
  res.json({ ok: true });
});

router.get('/sos', requireAuth('admin'), async (_req, res) => {
  const alerts = await prisma.sosAlert.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { sentAt: 'desc' },
  });
  res.json(alerts);
});

export default router;
