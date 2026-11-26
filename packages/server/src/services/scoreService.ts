import { prisma } from '../lib/prisma';
import { DEFAULT_INTERMEDIATE_STEPS } from './dispatchService';

export async function computeAdjustedTimeMs(teamId: number, finishTimestampMs: number): Promise<number> {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  if (!game || !game.startedAt) throw new Error('Game not started');

  const elapsedMs = finishTimestampMs - game.startedAt.getTime() - game.totalPausedMs;

  const penalties = await prisma.penalty.findMany({ where: { teamId } });
  const penaltyMs = penalties.reduce((s, p) => s + p.minutes * 60_000, 0);

  const checkpoints = await prisma.teamCheckpoint.findMany({
    where: { teamId },
    include: { checkpoint: true },
  });
  const bonusMs = checkpoints
    .filter((c) => c.checkpoint.rewardKind === 'bonus_minutes')
    .reduce((s, c) => s + c.checkpoint.rewardValue * 60_000, 0);

  return Math.max(0, elapsedMs + penaltyMs - bonusMs);
}

export interface StageSplitEntry {
  stepNumber: number;
  title: string;
  isFinal: boolean;
  unlockedAt: string;
  locationReachedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  hintsUsed: number;
  durationSecs: number | null;
}

export interface PenaltyLogEntry {
  id: number;
  kind: string;
  minutes: number;
  appliedAt: string;
}

export interface TeamRanking {
  rank: number;
  teamId: number;
  teamName: string;
  currentLevel: number;
  totalSteps: number;
  completedStages: number;
  currentStageTitle: string;
  locationReached: boolean;
  rawElapsedSecs: number | null;
  adjustedTimeSecs: number | null;
  hintPenaltyMins: number;
  zonePenaltyMins: number;
  adminPenaltyMins: number;
  bonusMins: number;
  totalPenaltyMins: number;
  netAdjustmentMins: number;
  hintsUsedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  latestPhotoStatus: string | null;
  finished: boolean;
  stageBreakdown: StageSplitEntry[];
  penaltyLog: PenaltyLogEntry[];
}

// In-memory 2-second cache to prevent SQLite thrashing during high concurrency
let cachedLeaderboard: { timestamp: number; data: TeamRanking[] } | null = null;
const CACHE_TTL_MS = 2000;

export function invalidateLeaderboardCache() {
  cachedLeaderboard = null;
}

export async function buildLeaderboard(forceRefresh = false): Promise<TeamRanking[]> {
  const now = Date.now();
  if (!forceRefresh && cachedLeaderboard && now - cachedLeaderboard.timestamp < CACHE_TTL_MS) {
    return cachedLeaderboard.data;
  }

  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const [intermediateCount, finaleExists, teams] = await Promise.all([
    game ? prisma.level.count({ where: { gameId: game.id, isFinal: false } }) : Promise.resolve(0),
    game ? prisma.level.findFirst({ where: { gameId: game.id, isFinal: true }, select: { id: true } }) : Promise.resolve(null),
    prisma.team.findMany({
      include: {
        levelProgress: { include: { level: true }, orderBy: { stepNumber: 'asc' } },
        teamPaths: { select: { id: true } },
        penalties: { orderBy: { appliedAt: 'asc' } },
        checkpoints: { include: { checkpoint: true }, orderBy: { claimedAt: 'asc' } },
        photos: {
          ...(game?.startedAt ? { where: { submittedAt: { gte: game.startedAt } } } : {}),
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    }),
  ]);

  const fallbackTotalSteps = Math.min(DEFAULT_INTERMEDIATE_STEPS, intermediateCount) + (finaleExists ? 1 : 0);

  const rows: TeamRanking[] = teams.map((team) => {
    const finished = !!team.finishedAt;
    const ascProgress = team.levelProgress;
    const latestProgress = ascProgress[ascProgress.length - 1];
    const activeProgress = ascProgress.find((p) => !p.completedAt) ?? latestProgress;
    const completedStages = ascProgress.filter((p) => p.completedAt != null).length;
    const currentStep = activeProgress?.stepNumber ?? 0;

    const totalSteps =
      team.teamPaths.length > 0
        ? team.teamPaths.length + (finaleExists ? 1 : 0)
        : fallbackTotalSteps;

    const hintPenaltyMins = team.penalties
      .filter((p) => p.kind === 'hint')
      .reduce((s, p) => s + p.minutes, 0);
    const zonePenaltyMins = team.penalties
      .filter((p) => p.kind === 'zone')
      .reduce((s, p) => s + p.minutes, 0);
    const adminPenaltyMins = team.penalties
      .filter((p) => p.kind !== 'hint' && p.kind !== 'zone')
      .reduce((s, p) => s + p.minutes, 0);

    const totalPenaltyMins = team.penalties.reduce((s, p) => s + p.minutes, 0);
    const bonusMins = team.checkpoints
      .filter((c) => c.checkpoint.rewardKind === 'bonus_minutes')
      .reduce((s, c) => s + c.checkpoint.rewardValue, 0);
    const netAdjustmentMins = totalPenaltyMins - bonusMins;
    const hintsUsedCount = ascProgress.reduce((s, p) => s + (p.hintsUsed || 0), 0);

    let rawElapsedSecs: number | null = null;
    let adjustedTimeSecs: number | null = null;
    if (finished && game?.startedAt && team.finishedAt) {
      const finishMs = team.finishedAt.getTime();
      const elapsedMs = Math.max(0, finishMs - game.startedAt.getTime() - game.totalPausedMs);
      rawElapsedSecs = elapsedMs / 1000;
      const netMs = netAdjustmentMins * 60_000;
      adjustedTimeSecs = Math.max(0, elapsedMs + netMs) / 1000;
    }

    const stageBreakdown: StageSplitEntry[] = ascProgress.map((p) => ({
      stepNumber: p.stepNumber,
      title: p.level.title,
      isFinal: p.level.isFinal,
      unlockedAt: p.unlockedAt.toISOString(),
      locationReachedAt: p.locationReachedAt ? p.locationReachedAt.toISOString() : null,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      completedBy: p.completedBy ?? null,
      hintsUsed: p.hintsUsed,
      durationSecs: p.completedAt
        ? Math.max(0, Math.round((p.completedAt.getTime() - p.unlockedAt.getTime()) / 1000))
        : null,
    }));

    const penaltyLog: PenaltyLogEntry[] = [
      ...team.penalties.map((p) => ({
        id: p.id,
        kind: p.kind,
        minutes: p.minutes,
        appliedAt: p.appliedAt.toISOString(),
      })),
      ...team.checkpoints
        .filter((c) => c.checkpoint.rewardKind === 'bonus_minutes')
        .map((c) => ({
          id: -c.id,
          kind: 'checkpoint_bonus',
          minutes: -c.checkpoint.rewardValue,
          appliedAt: c.claimedAt.toISOString(),
        })),
    ].sort((a, b) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime());

    return {
      rank: 0,
      teamId: team.id,
      teamName: team.name,
      currentLevel: currentStep,
      totalSteps: Math.max(1, totalSteps),
      completedStages,
      currentStageTitle: finished
        ? 'Completed Hunt'
        : activeProgress?.level?.title ?? (game?.status === 'idle' ? 'Standby' : 'Stage 1'),
      locationReached: Boolean(activeProgress?.locationReachedAt),
      rawElapsedSecs,
      adjustedTimeSecs,
      hintPenaltyMins,
      zonePenaltyMins,
      adminPenaltyMins,
      bonusMins,
      totalPenaltyMins,
      netAdjustmentMins,
      hintsUsedCount,
      startedAt: game?.startedAt ? game.startedAt.toISOString() : null,
      finishedAt: team.finishedAt ? team.finishedAt.toISOString() : null,
      latestPhotoStatus: team.photos[0]?.status ?? null,
      finished,
      stageBreakdown,
      penaltyLog,
    };
  });

  // Sort: finished teams by adjustedTimeSecs asc, then unfinished by completedStages desc, currentLevel desc, netAdjustmentMins asc
  rows.sort((a, b) => {
    if (a.finished && b.finished) return (a.adjustedTimeSecs ?? 0) - (b.adjustedTimeSecs ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (b.completedStages !== a.completedStages) return b.completedStages - a.completedStages;
    if (b.currentLevel !== a.currentLevel) return b.currentLevel - a.currentLevel;
    return a.netAdjustmentMins - b.netAdjustmentMins;
  });

  rows.forEach((r, i) => (r.rank = i + 1));
  cachedLeaderboard = { timestamp: now, data: rows };
  return rows;
}
