import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { buildLeaderboard } from './scoreService';

const activeTimers = new Map<number, NodeJS.Timeout>(); // key: TeamLevelProgress.id

export function scheduleTeamLevelTimer(
  io: Server,
  progressId: number,
  teamId: number,
  levelId: number,
  deadlineMs: number,
) {
  const delay = deadlineMs - Date.now();
  if (delay <= 0) {
    void autoUnlockLevel(io, progressId, teamId, levelId);
    return;
  }

  const handle = setTimeout(async () => {
    await autoUnlockLevel(io, progressId, teamId, levelId);
  }, delay);

  activeTimers.set(progressId, handle);
}

export function cancelTeamLevelTimer(progressId: number) {
  const handle = activeTimers.get(progressId);
  if (handle) {
    clearTimeout(handle);
    activeTimers.delete(progressId);
  }
}

async function autoUnlockLevel(io: Server, progressId: number, teamId: number, levelId: number) {
  activeTimers.delete(progressId);

  const progress = await prisma.teamLevelProgress.findUnique({ where: { id: progressId } });
  if (!progress || progress.completedAt) return; // already completed

  await prisma.teamLevelProgress.update({
    where: { id: progressId },
    data: { completedAt: new Date(), completedBy: 'timer_expiry' },
  });

  // Find next level
  const currentLevel = await prisma.level.findUnique({ where: { id: levelId } });
  if (!currentLevel) return;

  const nextLevel = await prisma.level.findFirst({
    where: { gameId: currentLevel.gameId, orderIndex: currentLevel.orderIndex + 1 },
  });

  io.to(`team:${teamId}`).emit('level:auto_unlocked', {
    levelId,
    orderIndex: currentLevel.orderIndex,
    reason: 'timer_expiry',
  });

  if (nextLevel) {
    const unlockRecord = await prisma.teamLevelProgress.create({
      data: { teamId, levelId: nextLevel.id, unlockedAt: new Date() },
    });

    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: nextLevel.id,
      orderIndex: nextLevel.orderIndex,
      unlockedAt: unlockRecord.unlockedAt,
    });

    if (nextLevel.durationSecs) {
      const deadline = unlockRecord.unlockedAt.getTime() + nextLevel.durationSecs * 1000;
      scheduleTeamLevelTimer(io, unlockRecord.id, teamId, nextLevel.id, deadline);
    }
  }

  // Broadcast updated leaderboard
  const rankings = await buildLeaderboard();
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (game) io.to(`game:${game.id}`).emit('leaderboard:updated', { rankings });
}

/** Called on server startup — reschedule any in-progress level timers */
export async function rescheduleTimers(io: Server) {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game || game.status !== 'running') return;

  const inProgress = await prisma.teamLevelProgress.findMany({
    where: { completedAt: null },
    include: { level: true },
  });

  for (const p of inProgress) {
    if (!p.level.durationSecs) continue;
    const pausedExtra = game.totalPausedMs;
    const deadline = p.unlockedAt.getTime() + p.level.durationSecs * 1000 + pausedExtra;
    scheduleTeamLevelTimer(io, p.id, p.teamId, p.levelId, deadline);
  }

  console.log(`Rescheduled ${inProgress.length} level timer(s).`);
}
