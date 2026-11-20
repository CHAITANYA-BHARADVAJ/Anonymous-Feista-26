import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';

const router = Router();

// List levels for a game
router.get('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const levels = await prisma.level.findMany({
    where: { gameId: Number(req.params.gameId) },
    orderBy: { orderIndex: 'asc' },
    include: { socialLinks: true, hints: { orderBy: { orderIndex: 'asc' } }, checkpoints: true },
  });
  res.json(levels);
});

// Create level
router.post('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const data = { ...req.body };
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.create({
    data: { ...data, gameId: Number(req.params.gameId) },
  });
  res.status(201).json(level);
});

// Update level
router.put('/:id', requireAuth('admin'), async (req, res) => {
  const data = { ...req.body };
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(level);
});

router.patch('/:id', requireAuth('admin'), async (req, res) => {
  const data = { ...req.body };
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(level);
});

// Delete level
router.delete('/:id', requireAuth('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const completed = await prisma.teamLevelProgress.count({
    where: { levelId: id, completedAt: { not: null } },
  });
  if (completed > 0) {
    res.status(400).json({ error: 'Cannot delete a level already completed by teams' });
    return;
  }
  await prisma.level.delete({ where: { id } });
  res.json({ ok: true });
});

// Add hint
router.post('/:id/hints', requireAuth('admin'), async (req, res) => {
  const hint = await prisma.hint.create({
    data: { ...req.body, levelId: Number(req.params.id) },
  });
  res.status(201).json(hint);
});

// Update hint
router.put('/hints/:id', requireAuth('admin'), async (req, res) => {
  const hint = await prisma.hint.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json(hint);
});

// Add checkpoint
router.post('/:id/checkpoints', requireAuth('admin'), async (req, res) => {
  const cp = await prisma.checkpoint.create({
    data: { ...req.body, levelId: Number(req.params.id) },
  });
  res.status(201).json(cp);
});

export default router;
