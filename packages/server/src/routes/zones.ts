import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';

const router = Router();

router.get('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const zones = await prisma.mapZone.findMany({ where: { gameId: Number(req.params.gameId) } });
  res.json(zones);
});

router.post('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const zone = await prisma.mapZone.create({
    data: { ...req.body, gameId: Number(req.params.gameId) },
  });
  io.to(`game:${req.params.gameId}`).emit('zone:updated', { zone });
  res.status(201).json(zone);
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const zone = await prisma.mapZone.update({ where: { id: Number(req.params.id) }, data: req.body });
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game) io.to(`game:${game.id}`).emit('zone:updated', { zone });
  res.json(zone);
});

router.patch('/:id/toggle', requireAuth('admin'), async (req, res) => {
  const existing = await prisma.mapZone.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const zone = await prisma.mapZone.update({
    where: { id: Number(req.params.id) },
    data: { active: !existing.active },
  });
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game) io.to(`game:${game.id}`).emit('zone:updated', { zone });
  res.json(zone);
});

router.delete('/:id', requireAuth('admin'), async (req, res) => {
  await prisma.mapZone.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

export default router;
