import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { buildLeaderboard } from '../services/scoreService';

const router = Router();

router.get('/teams', requireAuth('admin'), async (_req, res) => {
  const teams = await prisma.team.findMany({
    include: {
      levelProgress: { include: { level: true }, orderBy: { level: { orderIndex: 'desc' } } },
      penalties: true,
      locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
  });
  res.json(teams);
});

router.get('/teams/:id/location', requireAuth('admin'), async (req, res) => {
  const loc = await prisma.teamLocation.findFirst({
    where: { teamId: Number(req.params.id) },
    orderBy: { recordedAt: 'desc' },
  });
  res.json(loc ?? null);
});

router.get('/photos', requireAuth('admin'), async (_req, res) => {
  const photos = await prisma.photo.findMany({
    where: { status: 'pending' },
    include: { team: { select: { name: true } } },
    orderBy: { submittedAt: 'asc' },
  });
  res.json(photos);
});

router.patch('/photos/:id', requireAuth('admin'), async (req, res) => {
  const { status, reviewNote } = req.body as {
    status: 'approved' | 'rejected';
    reviewNote?: string;
  };

  const photo = await prisma.photo.update({
    where: { id: Number(req.params.id) },
    data: { status, reviewNote: reviewNote ?? null, reviewedAt: new Date() },
  });

  io.to(`team:${photo.teamId}`).emit('photo:status_changed', {
    photoId: photo.id,
    status,
    reviewNote,
  });

  if (status === 'approved') {
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    const team = await prisma.team.findUnique({ where: { id: photo.teamId } });
    const rankings = await buildLeaderboard();
    const winner = rankings.find((r) => r.finished && r.teamId === photo.teamId);

    if (game) {
      io.to(`game:${game.id}`).emit('winner:declared', {
        teamId: photo.teamId,
        teamName: team?.name,
        adjustedTimeSecs: winner?.adjustedTimeSecs,
      });
      io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
    }
  }

  res.json(photo);
});

router.get('/sos', requireAuth('admin'), async (_req, res) => {
  const alerts = await prisma.sosAlert.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { sentAt: 'desc' },
  });
  res.json(alerts);
});

export default router;
