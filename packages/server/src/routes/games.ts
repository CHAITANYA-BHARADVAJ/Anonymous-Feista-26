import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard } from '../services/scoreService';
import { rescheduleTimers, cancelTeamLevelTimer } from '../services/timerService';
import { kickoffConflictFreeGame, getCampusOccupancyMatrix } from '../services/dispatchService';

const router = Router();

router.get('/', requireAuth('admin'), async (_req, res) => {
  const games = await prisma.game.findMany({ orderBy: { id: 'desc' } });
  res.json(games);
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name } = req.body as { name: string };
  const game = await prisma.game.create({ data: { name } });
  res.status(201).json(game);
});

router.get('/:id', requireAuth('admin'), async (req, res) => {
  const game = await prisma.game.findUnique({
    where: { id: Number(req.params.id) },
    include: { levels: { orderBy: { orderIndex: 'asc' } }, zones: true },
  });
  if (!game) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(game);
});

router.patch('/:id/status', requireAuth('admin'), async (req, res) => {
  const gameId = Number(req.params.id);
  const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' | 'reset' };

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) { res.status(404).json({ error: 'Not found' }); return; }

  let update: Parameters<typeof prisma.game.update>[0]['data'] = {};

  if (action === 'start') {
    // If game was ended or resetting, clean up prior completion timestamps
    await prisma.team.updateMany({ data: { finishedAt: null } });
    await prisma.teamPath.deleteMany({});
    await prisma.hintReveal.deleteMany({});
    await prisma.teamLevelProgress.deleteMany({});
    await prisma.teamLocation.deleteMany({});
    await prisma.sosAlert.deleteMany({});
    await prisma.penalty.deleteMany({});

    update = { status: 'running', startedAt: new Date(), endedAt: null, pausedAt: null, totalPausedMs: 0 };
    await prisma.game.update({ where: { id: gameId }, data: update });

    // Kick off conflict-free synchronized distribution across unique starting landmarks
    try {
      await kickoffConflictFreeGame(io, gameId);
    } catch (err: any) {
      console.warn('Conflict-free kickoff warning:', err.message);
    }

    const updated = await prisma.game.findUnique({ where: { id: gameId } });
    io.emit('game:status', { status: 'running', game: updated });
    res.json(updated);
    return;
  } else if (action === 'pause' && game.status === 'running') {
    update = { status: 'paused', pausedAt: new Date() };
  } else if (action === 'resume' && game.status === 'paused') {
    const extra = game.pausedAt ? Date.now() - game.pausedAt.getTime() : 0;
    update = { status: 'running', pausedAt: null, totalPausedMs: game.totalPausedMs + extra };
    await rescheduleTimers(io);
  } else if (action === 'end') {
    update = { status: 'ended', endedAt: new Date() };
  } else if (action === 'reset') {
    update = { status: 'idle', startedAt: null, pausedAt: null, endedAt: null, totalPausedMs: 0 };
    await prisma.team.updateMany({ data: { finishedAt: null } });
    await prisma.teamPath.deleteMany({});
    await prisma.hintReveal.deleteMany({});
    await prisma.teamLevelProgress.deleteMany({});
    await prisma.teamLocation.deleteMany({});
    await prisma.sosAlert.deleteMany({});
    await prisma.penalty.deleteMany({});
  } else {
    res.status(400).json({ error: `Invalid action "${action}" for status "${game.status}"` });
    return;
  }

  const updated = await prisma.game.update({ where: { id: gameId }, data: update });
  io.to(`game:${gameId}`).emit('game:status_changed', {
    status: updated.status,
    startedAt: updated.startedAt,
    pausedAt: updated.pausedAt,
    endedAt: updated.endedAt,
    totalPausedMs: updated.totalPausedMs,
  });

  const rankings = await buildLeaderboard();
  io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });

  res.json(updated);
});

router.post('/:id/announcements', requireAuth('admin'), async (req, res) => {
  const { message, kind, targetTeamId } = req.body as {
    message: string;
    kind: 'broadcast' | 'nudge';
    targetTeamId?: number;
  };
  const gameId = Number(req.params.id);

  const ann = await prisma.announcement.create({
    data: { gameId, message, kind, targetTeamId: targetTeamId ?? null, sentAt: new Date() },
  });

  if (kind === 'broadcast') {
    io.to(`game:${gameId}`).emit('game:announcement', { kind, message, sentAt: ann.sentAt });
  } else if (targetTeamId) {
    io.to(`team:${targetTeamId}`).emit('game:announcement', { kind, message, sentAt: ann.sentAt });
  }
  res.status(201).json(ann);
});

// Live Campus Landmark Occupancy Matrix for Conflict-Free Monitor
router.get('/:id/occupancy', requireAuth('admin'), async (req, res) => {
  const gameId = Number(req.params.id);
  const matrix = await getCampusOccupancyMatrix(gameId);
  res.json(matrix);
});

// Update game settings (registration open/close, max teams limit)
router.patch('/:id/settings', requireAuth('admin'), async (req, res) => {
  const gameId = Number(req.params.id);
  const { registrationOpen, maxTeams } = req.body as {
    registrationOpen?: boolean;
    maxTeams?: number;
  };

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: {
      ...(registrationOpen != null ? { registrationOpen: Boolean(registrationOpen) } : {}),
      ...(maxTeams != null ? { maxTeams: Number(maxTeams) } : {}),
    },
  });

  io.emit('game:settings_updated', {
    registrationOpen: updated.registrationOpen,
    maxTeams: updated.maxTeams,
  });

  res.json(updated);
});

export default router;
