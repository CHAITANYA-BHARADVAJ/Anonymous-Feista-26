import { prisma } from '../lib/prisma';

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

export interface TeamRanking {
  rank: number;
  teamId: number;
  teamName: string;
  currentLevel: number;
  adjustedTimeSecs: number | null;
  finished: boolean;
}

export async function buildLeaderboard(): Promise<TeamRanking[]> {
  const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
  const teams = await prisma.team.findMany({
    include: {
      levelProgress: { include: { level: true }, orderBy: { stepNumber: 'desc' } },
      penalties: true,
      checkpoints: { include: { checkpoint: true } },
    },
  });

  const rows: TeamRanking[] = teams.map((team) => {
    const finished = !!team.finishedAt;
    const currentStep = team.levelProgress[0]?.stepNumber ?? 0;

    let adjustedTimeSecs: number | null = null;
    if (finished && game?.startedAt && team.finishedAt) {
      const finishMs = team.finishedAt.getTime();
      const elapsedMs = finishMs - game.startedAt.getTime() - game.totalPausedMs;
      const penaltyMs = team.penalties.reduce((s, p) => s + p.minutes * 60_000, 0);
      const bonusMs = team.checkpoints
        .filter((c) => c.checkpoint.rewardKind === 'bonus_minutes')
        .reduce((s, c) => s + c.checkpoint.rewardValue * 60_000, 0);
      adjustedTimeSecs = Math.max(0, elapsedMs + penaltyMs - bonusMs) / 1000;
    }

    return {
      rank: 0,
      teamId: team.id,
      teamName: team.name,
      currentLevel: currentStep,
      adjustedTimeSecs,
      finished,
    };
  });

  // Sort: finished teams by adjustedTimeSecs asc, then unfinished by level desc
  rows.sort((a, b) => {
    if (a.finished && b.finished) return (a.adjustedTimeSecs ?? 0) - (b.adjustedTimeSecs ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.currentLevel - a.currentLevel;
  });

  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
