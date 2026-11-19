import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard } from '../services/scoreService';
import { rescheduleTimers, cancelTeamLevelTimer } from '../services/timerService';

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
  const { action } = req.body as { action: 'start' | 'pause' | 'resume' | 'end' };

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) { res.status(404).json({ error: 'Not found' }); return; }

  let update: Parameters<typeof prisma.game.update>[0]['data'] = {};

  if (action === 'start' && game.status === 'idle') {
    update = { status: 'running', startedAt: new Date() };
    // Unlock level 1 for all teams
    const teams = await prisma.team.findMany();
    const level1 = await prisma.level.findFirst({ where: { gameId, orderIndex: 1 } });
    if (level1) {
      for (const team of teams) {
        await prisma.teamLevelProgress.upsert({
          where: { teamId_levelId: { teamId: team.id, levelId: level1.id } },
          update: {},
          create: { teamId: team.id, levelId: level1.id, unlockedAt: new Date() },
        });
      }
    }
  } else if (action === 'pause' && game.status === 'running') {
    update = { status: 'paused', pausedAt: new Date() };
  } else if (action === 'resume' && game.status === 'paused' && game.pausedAt) {
    const extra = Date.now() - game.pausedAt.getTime();
    update = { status: 'running', pausedAt: null, totalPausedMs: game.totalPausedMs + extra };
    await rescheduleTimers(io);
  } else if (action === 'end') {
    update = { status: 'ended', endedAt: new Date() };
  } else {
    res.status(400).json({ error: `Invalid action "${action}" for status "${game.status}"` });
    return;
  }

  const updated = await prisma.game.update({ where: { id: gameId }, data: update });
  io.to(`game:${gameId}`).emit('game:status_changed', {
    status: updated.status,
    startedAt: updated.startedAt,
    pausedAt: updated.pausedAt,
  });
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

export default router;
