import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { buildLeaderboard } from './scoreService';

// Fisher-Yates shuffle helper
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a randomized balanced path of clues for a team.
 * From N available intermediate clues (10–15), selects up to 9 clues,
 * shuffles them so each team traverses the campus in a unique sequence,
 * and saves them into the TeamPath table.
 */
export async function generateTeamPath(
  teamId: number,
  gameId: number,
  intermediateLevels?: any[],
  targetCount = 9,
) {
  // If team already has path rows, return them
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

  // Count to assign (up to 9, or all if pool is smaller)
  const count = Math.min(targetCount, poolLevels.length);

  // Pick count distinct levels from pool
  const shuffledPool = shuffleArray(poolLevels);
  const selectedLevels = shuffledPool.slice(0, count);

  // Randomize sequence of selected clues
  const orderedLevels = shuffleArray(selectedLevels);

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
 * Distributes all registered teams across their starting clues.
 * Generates randomized paths (9 intermediate clues each) from available campus landmarks (10-15).
 */
export async function kickoffConflictFreeGame(io: Server, gameId: number) {
  const teams = await prisma.team.findMany({ orderBy: { id: 'asc' } });
  if (teams.length === 0) return { teamsCount: 0, allocated: 0 };

  // Fetch intermediate levels (isFinal = false)
  const intermediateLevels = await prisma.level.findMany({
    where: { gameId, isFinal: false },
    orderBy: { orderIndex: 'asc' },
  });

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

  // Generate paths and unlock starting clue for each team
  for (const team of teams) {
    const paths = await generateTeamPath(team.id, gameId, intermediateLevels, 9);
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

    // Emit starting clue to team
    io.to(`team:${team.id}`).emit('level:unlocked', {
      levelId: firstLevel.id,
      stepNumber: 1,
      totalSteps: 10,
      title: firstLevel.title,
      isFinal: false,
      unlockedAt: progress.unlockedAt,
    });
  }

  // Broadcast occupancy matrix to admin desk
  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
  return { teamsCount: teams.length, allocated: teams.length };
}

/**
 * Path-Based Dispatch Engine:
 * When a team solves their current clue, unlocks their next assigned clue along their route.
 * Once 9 intermediate clues are accomplished, automatically unlocks Step 10: Grand Finale!
 */
export async function dispatchNextConflictFreeClue(io: Server, teamId: number, gameId: number) {
  // Fetch all completed progress for this team
  const teamProgress = await prisma.teamLevelProgress.findMany({
    where: { teamId },
    include: { level: true },
    orderBy: { stepNumber: 'asc' },
  });

  const completedCount = teamProgress.filter((p) => p.completedAt != null).length;

  // Case 1: Team has completed 9 intermediate clues -> Advance to Step 10: Grand Finale!
  if (completedCount === 9) {
    const finaleLevel = await prisma.level.findFirst({
      where: { gameId, isFinal: true },
    });

    if (!finaleLevel) {
      throw new Error('Grand Finale level not found. Please mark a level with isFinal=true in the studio.');
    }

    const nextProgress = await prisma.teamLevelProgress.create({
      data: {
        teamId,
        levelId: finaleLevel.id,
        stepNumber: 10,
        unlockedAt: new Date(),
      },
    });

    io.to(`team:${teamId}`).emit('level:unlocked', {
      levelId: finaleLevel.id,
      stepNumber: 10,
      totalSteps: 10,
      title: finaleLevel.title,
      isFinal: true,
      unlockedAt: nextProgress.unlockedAt,
    });

    io.to('admin').emit('team:advancing_to_finale', {
      teamId,
      stepNumber: 10,
      timestamp: new Date(),
    });

    io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
    return { finished: false, nextLevel: finaleLevel, stepNumber: 10 };
  }

  // Case 2: Team has completed 10 clues (including Grand Finale) -> Official Winner Finish!
  if (completedCount >= 10) {
    await prisma.team.update({
      where: { id: teamId },
      data: { finishedAt: new Date() },
    });

    const rankings = await buildLeaderboard();
    io.to(`game:${gameId}`).emit('leaderboard:updated', { rankings });
    io.to('admin').emit('team:hunt_completed', { teamId, timestamp: new Date() });
    io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
    return { finished: true, nextLevel: null, stepNumber: 10 };
  }

  // Case 3: Intermediate clue dispatch (Step 2 to Step 9)
  const nextStepNumber = completedCount + 1;

  // Ensure team path exists
  let targetPath = await prisma.teamPath.findUnique({
    where: { teamId_stepNumber: { teamId, stepNumber: nextStepNumber } },
    include: { level: true },
  });

  if (!targetPath) {
    // If path was missing, generate it on-the-fly
    const paths = await generateTeamPath(teamId, gameId, undefined, 9);
    targetPath = await prisma.teamPath.findUnique({
      where: { teamId_stepNumber: { teamId, stepNumber: nextStepNumber } },
      include: { level: true },
    });
  }

  if (!targetPath) {
    // If total available intermediate clues < 9 and team finished all of them, advance straight to finale!
    return dispatchNextConflictFreeClue(io, teamId, gameId);
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
    totalSteps: 10,
    title: chosenLevel.title,
    isFinal: false,
    unlockedAt: nextProgress.unlockedAt,
  });

  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
  return { finished: false, nextLevel: chosenLevel, stepNumber: nextStepNumber };
}

/**
 * Live Campus Occupancy Matrix:
 * Returns the status of all clue landmarks and which squads are currently investigating each one.
 * Supports multiple squads per landmark (transparent congestion/occupancy view).
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
