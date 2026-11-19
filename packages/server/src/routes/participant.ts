import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { photoUpload } from '../middleware/upload';
import { io } from '../index';
import { scheduleTeamLevelTimer } from '../services/timerService';
import { buildLeaderboard } from '../services/scoreService';

const router = Router();

// Get current game state for participant
router.get('/game', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const game = await prisma.game.findFirst({
    orderBy: { id: 'desc' },
    include: { zones: { where: { active: true } } },
  });
  if (!game) { res.status(404).json({ error: 'No game found' }); return; }

  const progress = await prisma.teamLevelProgress.findMany({
    where: { teamId },
    include: {
      level: {
        include: {
          socialLinks: true,
          hints: { orderBy: { orderIndex: 'asc' } },
          checkpoints: true,
        },
      },
      hintReveals: true,
    },
    orderBy: { level: { orderIndex: 'asc' } },
  });

  res.json({ game, progress });
});

// Submit level answer
router.post('/levels/:id/answer', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const levelId = Number(req.params.id);
  const { answer } = req.body as { answer: string };

  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

  if (level.isFinal) { res.status(400).json({ error: 'Final level uses photo submission' }); return; }

  const progress = await prisma.teamLevelProgress.findUnique({
    where: { teamId_levelId: { teamId, levelId } },
  });
  if (!progress) { res.status(400).json({ error: 'Level not unlocked' }); return; }
  if (progress.completedAt) { res.status(400).json({ error: 'Level already completed' }); return; }

  const correct = answer.trim().toLowerCase() === level.answer.trim().toLowerCase();
  if (!correct) { res.status(422).json({ error: 'Incorrect answer', correct: false }); return; }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });

  await prisma.teamLevelProgress.update({
    where: { id: progress.id },
    data: { completedAt: new Date(), completedBy: 'answer' },
  });

  // Unlock next level
  const nextLevel = await prisma.level.findFirst({
    where: { gameId: level.gameId, orderIndex: level.orderIndex + 1 },
  });

  if (nextLevel) {
    const nextProgress = await prisma.teamLevelProgress.create({
      data: { teamId, levelId: nextLevel.id, unlockedAt: new Date() },
    });

    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: nextLevel.id,
      orderIndex: nextLevel.orderIndex,
      unlockedAt: nextProgress.unlockedAt,
    });

    if (nextLevel.durationSecs && game?.status === 'running') {
      const deadline = nextProgress.unlockedAt.getTime() + nextLevel.durationSecs * 1000;
      scheduleTeamLevelTimer(io, nextProgress.id, teamId, nextLevel.id, deadline);
    }
  }

  // Update leaderboard
  const rankings = await buildLeaderboard();
  if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ correct: true, nextLevelId: nextLevel?.id ?? null });
});

// Reveal hint
router.post('/levels/:id/hints/:hintOrder/reveal', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const levelId = Number(req.params.id);
  const hintOrder = Number(req.params.hintOrder);

  const progress = await prisma.teamLevelProgress.findUnique({
    where: { teamId_levelId: { teamId, levelId } },
    include: { hintReveals: true },
  });
  if (!progress || progress.completedAt) {
    res.status(400).json({ error: 'Level not active' }); return;
  }

  const hint = await prisma.hint.findFirst({ where: { levelId, orderIndex: hintOrder } });
  if (!hint) { res.status(404).json({ error: 'Hint not found' }); return; }

  const alreadyRevealed = progress.hintReveals.some((r) => r.hintId === hint.id);
  if (alreadyRevealed) { res.status(400).json({ error: 'Hint already revealed' }); return; }

  if (progress.hintsUsed >= 3) { res.status(400).json({ error: 'Max hints used' }); return; }

  // Check if free hint from checkpoint
  const freeHints = await prisma.teamCheckpoint.count({
    where: {
      teamId,
      checkpoint: { rewardKind: 'free_hint', levelId },
    },
  });
  const paidHintsUsed = progress.hintReveals.length;
  const useFreeHint = paidHintsUsed < freeHints;

  await prisma.$transaction([
    prisma.hintReveal.create({
      data: { progressId: progress.id, hintId: hint.id, revealedAt: new Date() },
    }),
    prisma.teamLevelProgress.update({
      where: { id: progress.id },
      data: { hintsUsed: { increment: 1 } },
    }),
    ...(useFreeHint
      ? []
      : [
          prisma.penalty.create({
            data: { teamId, kind: 'hint', minutes: hint.penaltyMins, appliedAt: new Date() },
          }),
        ]),
  ]);

  res.json({ text: hint.text, penaltyMins: useFreeHint ? 0 : hint.penaltyMins });
});

// Claim checkpoint
router.post('/checkpoints/:id/claim', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const checkpointId = Number(req.params.id);
  const { qrPayload, answer } = req.body as { qrPayload?: string; answer?: string };

  const cp = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
  if (!cp) { res.status(404).json({ error: 'Not found' }); return; }

  const existing = await prisma.teamCheckpoint.findUnique({
    where: { teamId_checkpointId: { teamId, checkpointId } },
  });
  if (existing) { res.status(400).json({ error: 'Already claimed' }); return; }

  if (cp.kind === 'qr' && qrPayload?.trim() !== cp.qrPayload?.trim()) {
    res.status(422).json({ error: 'Invalid QR code' }); return;
  }
  if (cp.kind === 'question' && answer?.trim().toLowerCase() !== cp.answer?.trim().toLowerCase()) {
    res.status(422).json({ error: 'Incorrect answer' }); return;
  }

  await prisma.teamCheckpoint.create({ data: { teamId, checkpointId, claimedAt: new Date() } });

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const rankings = await buildLeaderboard();
  if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });

  res.json({ rewardKind: cp.rewardKind, rewardValue: cp.rewardValue });
});

// SOS
router.post('/sos', requireAuth('team'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  const { lat, lng } = req.body as { lat: number; lng: number };

  const alert = await prisma.sosAlert.create({ data: { teamId, lat, lng, sentAt: new Date() } });
  const team = await prisma.team.findUnique({ where: { id: teamId } });

  io.to('admin').emit('sos:received', {
    teamId,
    teamName: team?.name,
    lat,
    lng,
    sentAt: alert.sentAt,
  });

  res.json({ ok: true });
});

// Final photo upload
router.post('/final-photo', requireAuth('team'), photoUpload.single('photo'), async (req: AuthRequest, res) => {
  const teamId = req.user!.sub;
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  // Check a pending photo doesn't already exist
  const pending = await prisma.photo.findFirst({ where: { teamId, status: 'pending' } });
  if (pending) { res.status(400).json({ error: 'Submission already pending review' }); return; }

  const photo = await prisma.photo.create({
    data: { teamId, filePath: req.file.path, submittedAt: new Date() },
  });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  io.to('admin').emit('photo:new_submission', {
    photoId: photo.id,
    teamId,
    teamName: team?.name,
    submittedAt: photo.submittedAt,
  });

  res.status(201).json({ photoId: photo.id, status: 'pending' });
});

export default router;
