import { Router } from 'express';
import { buildLeaderboard } from '../services/scoreService';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  const rankings = await buildLeaderboard();
  res.json({ rankings });
});

router.get('/spectator/state', async (_req, res) => {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const rankings = await buildLeaderboard();
  const announcements = game
    ? await prisma.announcement.findMany({
        where: { gameId: game.id, kind: 'broadcast' },
        orderBy: { sentAt: 'desc' },
        take: 5,
      })
    : [];
  res.json({
    game: game
      ? {
          id: game.id,
          status: game.status,
          startedAt: game.startedAt,
          pausedAt: game.pausedAt,
          totalPausedMs: game.totalPausedMs,
          endedAt: game.endedAt,
          name: game.name,
        }
      : null,
    rankings,
    announcements,
  });
});

export default router;
