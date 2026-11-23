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
  const { name, code, leaderName, mobile } = req.body as {
    name?: string;
    code?: string;
    leaderName?: string;
    mobile?: string;
  };
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
      displayCode: trimmedCode,
      leaderName: leaderName?.trim() || null,
      mobile: mobile?.trim() || null,
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

  res.status(201).json({ id: team.id, name: team.name, displayCode: team.displayCode, createdAt: team.createdAt });
});

// Update or reset access code for a team (in case a team forgets their code)
router.patch('/teams/:id/code', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const { code } = req.body as { code?: string };

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  let newCode = code?.trim();
  if (!newCode) {
    // Generate clean 6-character alphanumeric code
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    newCode = rand;
  }

  if (newCode.length < 3) {
    res.status(400).json({ error: 'Access code must be at least 3 characters long' });
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

  // Revoke existing sessions so team logs in with new credentials
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

// Admin emergency override: Bypass GPS check for team's current landmark (decrypt clue instantly)
router.post('/teams/:id/bypass-gps', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
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

  // Notify team phone to decrypt clue instantly
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

  // Notify admin desk & map
  io.to('admin').emit('team:checkpoint_reached', {
    teamId,
    teamName: team.name,
    levelId: updatedProgress.levelId,
    levelTitle: updatedProgress.level.title,
    orderIndex: updatedProgress.level.orderIndex,
    reachedAt: updatedProgress.locationReachedAt,
    bypassedByAdmin: true,
  });

  res.json({
    ok: true,
    bypassed: true,
    stepNumber: updatedProgress.stepNumber,
    levelTitle: updatedProgress.level.title,
    locationReachedAt: updatedProgress.locationReachedAt,
  });
});

// Admin emergency override: Force complete current level and advance to next level/stage
router.post('/teams/:id/force-advance', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

  if (team.finishedAt) {
    res.status(400).json({ error: 'Team has already completed the hunt' });
    return;
  }

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
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, game.id);

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  io.emit('leaderboard:updated', { rankings });

  res.json({
    ok: true,
    completedLevel: activeProgress?.level ?? null,
    nextStepNumber: dispatch.stepNumber,
    nextLevel: dispatch.nextLevel,
    finished: dispatch.finished,
  });
});

// Admin emergency override: Force unlock next level for team (alias)
router.post('/teams/:id/force-unlock', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

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
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, game.id);

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  io.emit('leaderboard:updated', { rankings });

  res.json({ ok: true, unlockedLevel: dispatch.nextLevel, stepNumber: dispatch.stepNumber, finished: dispatch.finished });
});

// Admin emergency override: Force complete current level for team (alias)
router.post('/teams/:id/force-complete', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

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
  const dispatch = await dispatchNextConflictFreeClue(io, teamId, game.id);

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  io.emit('leaderboard:updated', { rankings });

  res.json({ ok: true, completedLevel: activeProgress?.level, nextLevelId: dispatch.nextLevel?.id ?? null, finished: dispatch.finished });
});

// Admin emergency override: Jump team directly to any target stage (1 to 10)
router.post('/teams/:id/jump-stage', requireAuth('admin'), async (req, res) => {
  const teamId = Number(req.params.id);
  const { targetStepNumber } = req.body as { targetStepNumber: number };

  if (!targetStepNumber || targetStepNumber < 1 || targetStepNumber > 10) {
    res.status(400).json({ error: 'targetStepNumber must be between 1 and 10' });
    return;
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game) { res.status(404).json({ error: 'No game' }); return; }

  // Mark all previous active progress as completed
  await prisma.teamLevelProgress.updateMany({
    where: { teamId, completedAt: null },
    data: { completedAt: new Date(), completedBy: 'admin_override' },
  });

  // Delete any progress at or above targetStepNumber so we can jump cleanly
  await prisma.teamLevelProgress.deleteMany({
    where: { teamId, stepNumber: { gte: targetStepNumber } },
  });

  let targetLevel: any = null;

  if (targetStepNumber === 10) {
    // Grand Finale
    targetLevel = await prisma.level.findFirst({ where: { gameId: game.id, isFinal: true } });
  } else {
    // Check TeamPath for this step
    let path = await prisma.teamPath.findUnique({
      where: { teamId_stepNumber: { teamId, stepNumber: targetStepNumber } },
      include: { level: true },
    });
    if (!path) {
      const { generateTeamPath } = await import('../services/dispatchService');
      await generateTeamPath(teamId, game.id, undefined, 9);
      path = await prisma.teamPath.findUnique({
        where: { teamId_stepNumber: { teamId, stepNumber: targetStepNumber } },
        include: { level: true },
      });
    }
    targetLevel = path?.level ?? null;
  }

  if (!targetLevel) {
    res.status(400).json({ error: 'Could not resolve target landmark for stage ' + targetStepNumber });
    return;
  }

  const newProgress = await prisma.teamLevelProgress.create({
    data: {
      teamId,
      levelId: targetLevel.id,
      stepNumber: targetStepNumber,
      unlockedAt: new Date(),
    },
  });

  // Broadcast to team phone
  io.to(`team:${teamId}`).emit('level:unlocked', {
    levelId: targetLevel.id,
    stepNumber: targetStepNumber,
    totalSteps: 10,
    title: targetLevel.title,
    isFinal: targetLevel.isFinal,
    unlockedAt: newProgress.unlockedAt,
  });

  const { getCampusOccupancyMatrix } = await import('../services/dispatchService');
  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(game.id));

  const rankings = await buildLeaderboard();
  io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
  io.emit('leaderboard:updated', { rankings });

  res.json({
    ok: true,
    stepNumber: targetStepNumber,
    level: targetLevel,
  });
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

// Quick aggregated game stats
router.get('/stats', requireAuth('admin'), async (_req, res) => {
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
});

export default router;
