import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard, invalidateLeaderboardCache } from '../services/scoreService';
import { kickoffConflictFreeGame, getCampusOccupancyMatrix } from '../services/dispatchService';
import { resetZoneRuntimeState } from '../services/zoneService';
import { asyncHandler, parsePositiveInt } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAuth('admin'),
  asyncHandler(async (_req, res) => {
    let games = await prisma.game.findMany({ orderBy: { id: 'desc' } });
    if (games.length === 0) {
      const defaultGame = await prisma.game.create({
        data: { name: 'Campus Hunt 2026 - SDMCET', status: 'idle' },
      });
      games = [defaultGame];
    }
    res.json(games);
  }),
);

router.post(
  '/',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'Game name is required' });
      return;
    }
    const game = await prisma.game.create({ data: { name } });
    res.status(201).json(game);
  }),
);

router.get(
  '/:id',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid game id' }); return; }

    const game = await prisma.game.findUnique({
      where: { id },
      include: { levels: { orderBy: { orderIndex: 'asc' } }, zones: true },
    });
    if (!game) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(game);
  }),
);

const VALID_GAME_ACTIONS = new Set(['start', 'pause', 'resume', 'end', 'reset']);

async function handleStatusChange(
  requestedGameId: number | undefined,
  action: 'start' | 'pause' | 'resume' | 'end' | 'reset',
  res: any,
) {
  if (!VALID_GAME_ACTIONS.has(action)) {
    res.status(400).json({ error: `Invalid action "${action}"` });
    return;
  }

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
    const intermediateCount = await prisma.level.count({
      where: { gameId, isFinal: false },
    });
    if (intermediateCount === 0) {
      res.status(400).json({
        error: 'No intermediate clues configured. Load Fiesta 13+1 or create clues in the studio before starting.',
      });
      return;
    }

    resetZoneRuntimeState();
    await prisma.team.updateMany({ data: { finishedAt: null } });
    await prisma.teamPath.deleteMany({});
    await prisma.hintReveal.deleteMany({});
    await prisma.teamLevelProgress.deleteMany({});
    await prisma.teamLocation.deleteMany({});
    await prisma.sosAlert.deleteMany({});
    await prisma.penalty.deleteMany({});

    update = { status: 'running', startedAt: new Date(), endedAt: null, pausedAt: null, totalPausedMs: 0 };
    await prisma.game.update({ where: { id: gameId }, data: update });

    await kickoffConflictFreeGame(io, gameId);
  } else if (action === 'pause') {
    if (game.status === 'paused') {
      update = { status: 'paused', pausedAt: game.pausedAt ?? new Date() };
    } else {
      update = { status: 'paused', pausedAt: new Date() };
    }
  } else if (action === 'resume') {
    if (game.status === 'running') {
      update = { status: 'running', pausedAt: null };
    } else if (game.status === 'paused') {
      const extra = game.pausedAt ? Math.max(0, Date.now() - game.pausedAt.getTime()) : 0;
      update = {
        status: 'running',
        pausedAt: null,
        totalPausedMs: (game.totalPausedMs || 0) + extra,
      };
    } else {
      update = { status: 'running', startedAt: game.startedAt ?? new Date(), pausedAt: null };
    }
  } else if (action === 'end') {
    const endTime = game.endedAt ?? new Date();
    const extraPaused =
      game.status === 'paused' && game.pausedAt
        ? Math.max(0, endTime.getTime() - game.pausedAt.getTime())
        : 0;
    update = {
      status: 'ended',
      endedAt: endTime,
      pausedAt: null,
      totalPausedMs: (game.totalPausedMs || 0) + extraPaused,
    };
  } else if (action === 'reset') {
    resetZoneRuntimeState();
    update = { status: 'idle', startedAt: null, pausedAt: null, endedAt: null, totalPausedMs: 0 };
    await prisma.team.updateMany({ data: { finishedAt: null } });
    await prisma.teamPath.deleteMany({});
    await prisma.hintReveal.deleteMany({});
    await prisma.teamLevelProgress.deleteMany({});
    await prisma.teamLocation.deleteMany({});
    await prisma.sosAlert.deleteMany({});
    await prisma.penalty.deleteMany({});
    await prisma.photo.deleteMany({});
    await prisma.announcement.deleteMany({ where: { gameId } });
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

  io.emit('game:status_changed', statusPayload);
  io.emit('game:status', statusPayload);
  io.to(`game:${gameId}`).emit('game:status_changed', statusPayload);
  io.to(`game:${gameId}`).emit('game:status', statusPayload);

  if (action === 'start') {
    io.emit('game:started', statusPayload);
    io.to(`game:${gameId}`).emit('game:started', statusPayload);
  }

  invalidateLeaderboardCache();
  try {
    const rankings = await buildLeaderboard(true);
    io.emit('leaderboard:updated', { rankings });
    io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });
  } catch (err: any) {
    console.warn('Leaderboard update error on status change:', err.message);
  }

  res.json(updated);
}

router.patch(
  '/:id/status',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' | 'reset' };
    await handleStatusChange(gameId, action, res);
  }),
);

router.patch(
  '/status',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' | 'reset' };
    await handleStatusChange(undefined, action, res);
  }),
);

router.post(
  '/:id/announcements',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }

    const { message, kind, targetTeamId } = req.body as {
      message?: string;
      kind?: string;
      targetTeamId?: number;
    };

    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed || trimmed.length > 500) {
      res.status(400).json({ error: 'Announcement message must be 1-500 characters' });
      return;
    }

    const safeKind = kind === 'nudge' ? 'nudge' : 'broadcast';
    const parsedTargetId = targetTeamId != null ? parsePositiveInt(targetTeamId) : null;
    if (safeKind === 'nudge' && !parsedTargetId) {
      res.status(400).json({ error: 'Valid targetTeamId is required for a nudge' });
      return;
    }

    const ann = await prisma.announcement.create({
      data: {
        gameId,
        message: trimmed,
        kind: safeKind,
        targetTeamId: parsedTargetId,
        sentAt: new Date(),
      },
    });

    if (safeKind === 'broadcast') {
      io.emit('game:announcement', { kind: safeKind, message: trimmed, sentAt: ann.sentAt });
      io.to(`game:${gameId}`).emit('game:announcement', { kind: safeKind, message: trimmed, sentAt: ann.sentAt });
    } else if (parsedTargetId) {
      io.to(`team:${parsedTargetId}`).emit('game:announcement', { kind: safeKind, message: trimmed, sentAt: ann.sentAt });
    }
    res.status(201).json(ann);
  }),
);

// Live Campus Landmark Occupancy Matrix
router.get(
  '/:id/occupancy',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }
    const matrix = await getCampusOccupancyMatrix(gameId);
    res.json(matrix);
  }),
);

// Update game settings (registration open/close, max teams limit)
router.patch(
  '/:id/settings',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.id);
    if (!gameId) { res.status(400).json({ error: 'Invalid game id' }); return; }

    const { registrationOpen, maxTeams } = req.body as {
      registrationOpen?: boolean;
      maxTeams?: number;
    };

    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (!existing) { res.status(404).json({ error: 'Game not found' }); return; }

    let nextMaxTeams: number | undefined;
    if (maxTeams !== undefined) {
      const parsedMax = Number(maxTeams);
      if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 500) {
        res.status(400).json({ error: 'maxTeams must be an integer between 1 and 500' });
        return;
      }
      nextMaxTeams = parsedMax;
    }

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: {
        ...(registrationOpen != null ? { registrationOpen: Boolean(registrationOpen) } : {}),
        ...(nextMaxTeams !== undefined ? { maxTeams: nextMaxTeams } : {}),
      },
    });

    io.emit('game:settings_updated', {
      registrationOpen: updated.registrationOpen,
      maxTeams: updated.maxTeams,
    });

    res.json(updated);
  }),
);

export default router;
