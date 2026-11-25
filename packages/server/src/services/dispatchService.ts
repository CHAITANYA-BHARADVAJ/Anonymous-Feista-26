import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { buildLeaderboard } from './scoreService';

export const DEFAULT_INTERMEDIATE_STEPS = 10;
const PRIME_STRIDE_CANDIDATES = [5, 3, 7, 11, 2, 1];

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Pick a deterministic stride coprime to poolLen:
 * - Odd teams (0-based even index: Team 01, 03, ...) advance +1 sequentially
 * - Even teams (0-based odd index: Team 02, 04, ...) jump by +5 (or nearest coprime stride)
 * On a 13-clue pool, this yields 26 unique 10-clue routes with max 2 teams/landmark per step and zero tailgating.
 */
export function selectRoundRobinStride(teamIndex: number, poolLen: number): number {
  if (poolLen <= 1) return 1;
  if (teamIndex % 2 === 0) return 1;
  for (const candidate of PRIME_STRIDE_CANDIDATES) {
    if (candidate < poolLen && gcd(candidate, poolLen) === 1) {
      return candidate;
    }
  }
  return 1;
}

/** Compute the ordered intermediate level sequence for a team in the round-robin pool */
export function buildRoundRobinSequence<T>(
  poolLevels: T[],
  teamIndex: number,
  targetCount = DEFAULT_INTERMEDIATE_STEPS,
): T[] {
  const poolLen = poolLevels.length;
  if (poolLen === 0) return [];

  const count = Math.min(targetCount, poolLen);
  const start = ((teamIndex % poolLen) + poolLen) % poolLen;
  const stride = selectRoundRobinStride(teamIndex, poolLen);

  const sequence: T[] = [];
  const used = new Set<number>();
  for (let k = 0; k < count; k++) {
    let idx = (start + k * stride) % poolLen;
    while (used.has(idx)) {
      idx = (idx + 1) % poolLen;
    }
    used.add(idx);
    sequence.push(poolLevels[idx]);
  }
  return sequence;
}

/** Resolve total steps (assigned intermediate clues + Grand Finale if present) for a team */
export async function getTotalStepsForTeam(teamId: number, gameId: number): Promise<number> {
  const [pathCount, finaleLevel] = await Promise.all([
    prisma.teamPath.count({ where: { teamId } }),
    prisma.level.findFirst({ where: { gameId, isFinal: true }, select: { id: true } }),
  ]);
  if (pathCount > 0) {
    return pathCount + (finaleLevel ? 1 : 0);
  }
  const intermediateCount = await prisma.level.count({ where: { gameId, isFinal: false } });
  const assigned = Math.min(DEFAULT_INTERMEDIATE_STEPS, intermediateCount);
  return assigned + (finaleLevel ? 1 : 0);
}

/**
 * Generate a deterministic Round-Robin + Prime-Stride clue path for a team.
 * From N ordered intermediate clues (e.g. 13), selects up to 10 clues using
 * start = teamIndex % N and alternating stride (+1 / +5 mod N), saving them into TeamPath.
 */
export async function generateTeamPath(
  teamId: number,
  gameId: number,
  intermediateLevels?: any[],
  targetCount = DEFAULT_INTERMEDIATE_STEPS,
  teamIndexOverride?: number,
) {
  const existing = await prisma.teamPath.findMany({
    where: { teamId },
    orderBy: { stepNumber: 'asc' },
  });
  if (existing.length > 0) return existing;

  const poolLevels =
    intermediateLevels ??
    (await prisma.level.findMany({
      where: { gameId, isFinal: false },
      orderBy: { orderIndex: 'asc' },
    }));

  if (poolLevels.length === 0) {
    return [];
  }

  const teamIndex =
    teamIndexOverride ?? (await prisma.team.count({ where: { id: { lt: teamId } } }));

  const orderedLevels = buildRoundRobinSequence(poolLevels, teamIndex, targetCount);

  const createdPaths = [];
  for (let i = 0; i < orderedLevels.length; i++) {
    const record = await prisma.teamPath.create({
      data: {
        teamId,
        levelId: orderedLevels[i].id,
        stepNumber: i + 1,
      },
    });
    createdPaths.push(record);
  }

  return createdPaths;
}

/**
 * Synchronized Game Kickoff:
 * Assigns each squad its round-robin starting clue (Team 01 -> C01, Team 02 -> C02, ...)
 * with alternating +1 / +5 strides across the ordered intermediate pool (10 clues + Final Location).
 */
export async function kickoffConflictFreeGame(io: Server, gameId: number) {
  const teams = await prisma.team.findMany({ orderBy: { id: 'asc' } });
  if (teams.length === 0) return { teamsCount: 0, allocated: 0 };

  const [intermediateLevels, finaleLevel] = await Promise.all([
    prisma.level.findMany({
      where: { gameId, isFinal: false },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.level.findFirst({
      where: { gameId, isFinal: true },
      select: { id: true },
    }),
  ]);

  if (intermediateLevels.length === 0) {
    throw new Error('No intermediate clues found. Please configure clues in the studio first.');
  }

  // Clear existing progress and paths for a fresh synchronized hunt
  await prisma.teamPath.deleteMany({});
  await prisma.hintReveal.deleteMany({});
  await prisma.teamLevelProgress.deleteMany({});
  await prisma.teamLocation.deleteMany({});
  await prisma.sosAlert.deleteMany({});
  await prisma.penalty.deleteMany({});
  await prisma.team.updateMany({ data: { finishedAt: null } });

  const totalSteps =
    Math.min(DEFAULT_INTERMEDIATE_STEPS, intermediateLevels.length) + (finaleLevel ? 1 : 0);

  for (let idx = 0; idx < teams.length; idx++) {
    const team = teams[idx];
    const paths = await generateTeamPath(
      team.id,
      gameId,
      intermediateLevels,
      DEFAULT_INTERMEDIATE_STEPS,
      idx,
    );
    if (paths.length === 0) continue;

    const firstStep = paths[0];
    const firstLevel = intermediateLevels.find((l) => l.id === firstStep.levelId);
    if (!firstLevel) continue;

    const progress = await prisma.teamLevelProgress.create({
      data: {
        teamId: team.id,
        levelId: firstLevel.id,
        stepNumber: 1,
        unlockedAt: new Date(),
      },
    });

    io.to(`team:${team.id}`).emit('level:unlocked', {
      levelId: firstLevel.id,
      stepNumber: 1,
      totalSteps,
      title: firstLevel.title,
      isFinal: false,
      unlockedAt: progress.unlockedAt,
    });
  }

  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
  return { teamsCount: teams.length, allocated: teams.length };
}

/**
 * Path-Based Dispatch Engine:
 * Unlocks each team's next assigned clue along their round-robin stride route.
 * Once all assigned intermediate clues (e.g. 10) are solved, unlocks Final Location (Step 11).
 */
export async function dispatchNextConflictFreeClue(io: Server, teamId: number, gameId: number) {
  const existingPaths = await generateTeamPath(teamId, gameId, undefined, DEFAULT_INTERMEDIATE_STEPS);
  const assignedIntermediateCount = existingPaths.length;

  const [teamProgress, finaleLevel] = await Promise.all([
    prisma.teamLevelProgress.findMany({
      where: { teamId },
      include: { level: true },
      orderBy: { stepNumber: 'asc' },
    }),
    prisma.level.findFirst({
      where: { gameId, isFinal: true },
    }),
  ]);

  const totalSteps = assignedIntermediateCount + (finaleLevel ? 1 : 0);
  const completedCount = teamProgress.filter((p) => p.completedAt != null).length;

  // Case 1: All assigned clues + Final Location completed -> Official Winner Finish!
  if (completedCount >= totalSteps && totalSteps > 0) {
    const finishedAt = new Date();
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: { finishedAt },
    });

    const rankings = await buildLeaderboard(true);
    const finishedRank = rankings.find((r) => r.teamId === teamId);
    io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });
    io.to(`game:${gameId}`).emit('winner:declared', {
      teamId,
      teamName: updatedTeam.name,
      adjustedTimeSecs: finishedRank?.adjustedTimeSecs,
    });
    io.to(`team:${teamId}`).emit('team:verified_finish', {
      finishedAt,
      rank: finishedRank?.rank,
    });
    io.to('admin').emit('team:hunt_completed', { teamId, timestamp: finishedAt });
    io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
    return { finished: true, nextLevel: null, stepNumber: totalSteps, totalSteps };
  }

  // Case 2: Team has completed all assigned intermediate clues -> Advance to Final Location!
  if (completedCount === assignedIntermediateCount) {
    if (!finaleLevel) {
      throw new Error('Grand Finale level not found. Please mark a level with isFinal=true in the studio.');
    }

    const finalStepNumber = assignedIntermediateCount + 1;
    const nextProgress = await prisma.teamLevelProgress.create({
      data: {
        teamId,
        levelId: finaleLevel.id,
        stepNumber: finalStepNumber,
        unlockedAt: new Date(),
      },
    });

    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: finaleLevel.id,
      stepNumber: finalStepNumber,
      totalSteps,
      title: finaleLevel.title,
      isFinal: true,
      unlockedAt: nextProgress.unlockedAt,
    });

    io.to('admin').emit('team:advancing_to_finale', {
      teamId,
      stepNumber: finalStepNumber,
      timestamp: new Date(),
    });

    io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
    return { finished: false, nextLevel: finaleLevel, stepNumber: finalStepNumber, totalSteps };
  }

  // Case 3: Next intermediate clue along this team's stride route (Steps 1..assignedIntermediateCount)
  const nextStepNumber = completedCount + 1;
  const targetPath = await prisma.teamPath.findUnique({
    where: { teamId_stepNumber: { teamId, stepNumber: nextStepNumber } },
    include: { level: true },
  });

  if (!targetPath) {
    throw new Error(`Missing route assignment for team ${teamId} at step ${nextStepNumber}`);
  }

  const chosenLevel = targetPath.level;
  const nextProgress = await prisma.teamLevelProgress.create({
    data: {
      teamId,
      levelId: chosenLevel.id,
      stepNumber: nextStepNumber,
      unlockedAt: new Date(),
    },
  });

  io.to(`team:${teamId}`).emit('level:unlocked', {
    levelId: chosenLevel.id,
    stepNumber: nextStepNumber,
    totalSteps,
    title: chosenLevel.title,
    isFinal: false,
    unlockedAt: nextProgress.unlockedAt,
  });

  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
  return { finished: false, nextLevel: chosenLevel, stepNumber: nextStepNumber, totalSteps };
}

/**
 * Live Campus Occupancy Matrix:
 * Returns the status of all clue landmarks and which squads are currently investigating each one.
 */
export async function getCampusOccupancyMatrix(gameId: number) {
  const levels = await prisma.level.findMany({
    where: { gameId },
    orderBy: { orderIndex: 'asc' },
    include: {
      teamProgress: {
        where: { completedAt: null },
        include: { team: { select: { id: true, name: true, leaderName: true } } },
      },
    },
  });

  return levels.map((lvl) => {
    const activeOccupants = lvl.teamProgress.map((tp) => ({
      teamId: tp.team.id,
      teamName: tp.team.name,
      leaderName: tp.team.leaderName,
      stepNumber: tp.stepNumber,
      unlockedAt: tp.unlockedAt,
    }));

    return {
      levelId: lvl.id,
      orderIndex: lvl.orderIndex,
      title: lvl.title,
      targetLat: lvl.targetLat,
      targetLng: lvl.targetLng,
      triggerRadiusMeters: lvl.triggerRadiusMeters,
      isFinal: lvl.isFinal,
      isOccupied: activeOccupants.length > 0,
      activeOccupants,
    };
  });
}
