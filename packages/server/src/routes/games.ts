import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard } from '../services/scoreService';
import { rescheduleTimers, cancelTeamLevelTimer } from '../services/timerService';
import { kickoffConflictFreeGame, getCampusOccupancyMatrix } from '../services/dispatchService';

const router = Router();

router.get('/', requireAuth('admin'), async (_req, res) => {
  let games = await prisma.game.findMany({ orderBy: { id: 'desc' } });
  if (games.length === 0) {
    const defaultGame = await prisma.game.create({
      data: { name: 'Campus Hunt 2026 - SDMCET', status: 'idle' },
    });
    games = [defaultGame];
  }
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

async function handleStatusChange(
  requestedGameId: number | undefined,
  action: 'start' | 'pause' | 'resume' | 'end' | 'reset',
  res: any,
) {
  let game = requestedGameId && !isNaN(requestedGameId)
    ? await prisma.game.findUnique({ where: { id: requestedGameId } })
    : null;

  if (!game) {
    game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  }

  if (!game) {
    game = await prisma.game.create({
      data: { name: 'Campus Hunt 2026 - SDMCET', status: 'idle' },
    });
  }

  const gameId = game.id;
  let update: Parameters<typeof prisma.game.update>[0]['data'] = {};

  if (action === 'start') {
    // Clean up prior run state and prepare conflict-free paths
    await prisma.team.updateMany({ data: { finishedAt: null } });
    await prisma.teamPath.deleteMany({});
    await prisma.hintReveal.deleteMany({});
    await prisma.teamLevelProgress.deleteMany({});
    await prisma.teamLocation.deleteMany({});
    await prisma.sosAlert.deleteMany({});
    await prisma.penalty.deleteMany({});

    update = { status: 'running', startedAt: new Date(), endedAt: null, pausedAt: null, totalPausedMs: 0 };
    await prisma.game.update({ where: { id: gameId }, data: update });

    try {
      await kickoffConflictFreeGame(io, gameId);
    } catch (err: any) {
      console.warn('Conflict-free kickoff warning:', err.message);
    }
  } else if (action === 'pause') {
    // Idempotent pause: if already paused, keep state safely
    if (game.status === 'paused') {
      update = { status: 'paused', pausedAt: game.pausedAt ?? new Date() };
    } else {
      update = { status: 'paused', pausedAt: new Date() };
    }
  } else if (action === 'resume') {
    // Idempotent resume: if already running, keep state safely
    if (game.status === 'running') {
      update = { status: 'running', pausedAt: null };
    } else if (game.status === 'paused') {
      const extra = game.pausedAt ? Math.max(0, Date.now() - game.pausedAt.getTime()) : 0;
      update = {
        status: 'running',
        pausedAt: null,
        totalPausedMs: (game.totalPausedMs || 0) + extra,
      };
      await rescheduleTimers(io);
    } else {
      // If idle or ended, resume starts the game
      update = { status: 'running', startedAt: game.startedAt ?? new Date(), pausedAt: null };
    }
  } else if (action === 'end') {
    // Idempotent end: can officially conclude the hunt at ANY time
    update = {
      status: 'ended',
      endedAt: game.endedAt ?? new Date(),
    };
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
    res.status(400).json({ error: `Invalid action "${action}"` });
    return;
  }

  const updated = await prisma.game.update({ where: { id: gameId }, data: update });

  const statusPayload = {
    status: updated.status,
    startedAt: updated.startedAt,
    pausedAt: updated.pausedAt,
    endedAt: updated.endedAt,
    totalPausedMs: updated.totalPausedMs,
    game: updated,
  };

  // Broadcast to all channels globally & specifically to room
  io.emit('game:status_changed', statusPayload);
  io.emit('game:status', statusPayload);
  io.to(`game:${gameId}`).emit('game:status_changed', statusPayload);
  io.to(`game:${gameId}`).emit('game:status', statusPayload);

  if (action === 'start') {
    io.emit('game:started', statusPayload);
    io.to(`game:${gameId}`).emit('game:started', statusPayload);
  }

  try {
    const rankings = await buildLeaderboard();
    io.emit('leaderboard:updated', { rankings });
    io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });
  } catch (err: any) {
    console.warn('Leaderboard update error on status change:', err.message);
  }

  res.json(updated);
}

router.patch('/:id/status', requireAuth('admin'), async (req, res) => {
  const gameId = Number(req.params.id);
  const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' | 'reset' };
  await handleStatusChange(gameId, action, res);
});

router.patch('/status', requireAuth('admin'), async (req, res) => {
  const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' | 'reset' };
  await handleStatusChange(undefined, action, res);
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
