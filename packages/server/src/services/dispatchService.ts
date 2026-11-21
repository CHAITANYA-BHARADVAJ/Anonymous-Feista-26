import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { scheduleTeamLevelTimer } from './timerService';
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
 * Synchronized Conflict-Free Game Kickoff:
 * Simultaneously distributes all active teams across unique intermediate starting landmarks.
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

  // Clear existing progress for a fresh synchronized hunt
  await prisma.hintReveal.deleteMany({});
  await prisma.teamLevelProgress.deleteMany({});
  await prisma.teamLocation.deleteMany({});
  await prisma.sosAlert.deleteMany({});
  await prisma.penalty.deleteMany({});
  await prisma.team.updateMany({ data: { finishedAt: null } });

  // Shuffle intermediate levels to ensure random distribution
  const shuffledLevels = shuffleArray(intermediateLevels);

  // Allocate 1 unique level to each team
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    // Pick unique level; wrap around only if teams > levels
    const chosenLevel = shuffledLevels[i % shuffledLevels.length];

    const progress = await prisma.teamLevelProgress.create({
      data: {
        teamId: team.id,
        levelId: chosenLevel.id,
        stepNumber: 1,
        unlockedAt: new Date(),
      },
    });

    if (chosenLevel.durationSecs) {
      const deadline = progress.unlockedAt.getTime() + chosenLevel.durationSecs * 1000;
      scheduleTeamLevelTimer(io, progress.id, team.id, chosenLevel.id, deadline);
    }

    // Emit live to team
    io.to(`team:${team.id}`).emit('level:unlocked', {
      levelId: chosenLevel.id,
      stepNumber: 1,
      totalSteps: 10,
      title: chosenLevel.title,
      isFinal: false,
      unlockedAt: progress.unlockedAt,
    });
  }

  // Broadcast occupancy update to admin desk
  io.to('admin').emit('admin:occupancy_update', await getCampusOccupancyMatrix(gameId));
  return { teamsCount: teams.length, allocated: teams.length };
}

/**
 * Dynamic Conflict-Free Allocation Engine:
 * When a team solves their current clue, dynamically assigns their next clue from the
 * unvisited pool that is 100% UNOCCUPIED by any other team.
 * When a team reaches 9 solved clues, clue #10 automatically becomes the single common Grand Finale!
 */
export async function dispatchNextConflictFreeClue(io: Server, teamId: number, gameId: number) {
  // Fetch all progress for this team
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

  // Case 3: Team needs intermediate clue (Step 2 to Step 9)
  const nextStepNumber = completedCount + 1;

  // All intermediate levels
  const intermediateLevels = await prisma.level.findMany({
    where: { gameId, isFinal: false },
  });

  // Level IDs already visited or currently assigned to THIS team
  const visitedLevelIds = new Set(teamProgress.map((p) => p.levelId));
  const unvisitedLevels = intermediateLevels.filter((lvl) => !visitedLevelIds.has(lvl.id));

  if (unvisitedLevels.length === 0) {
    // If somehow all intermediate levels were visited before step 9, proceed straight to finale
    return dispatchNextConflictFreeClue(io, teamId, gameId);
  }

  // Level IDs currently actively occupied by OTHER teams (in play, not yet completed)
  const activeOtherProgress = await prisma.teamLevelProgress.findMany({
    where: {
      completedAt: null,
      teamId: { not: teamId },
    },
    select: { levelId: true },
  });
  const occupiedLevelIds = new Set(activeOtherProgress.map((p) => p.levelId));

  // Find completely free, unoccupied landmarks that this team has not visited
  const freeUnoccupiedLevels = unvisitedLevels.filter((lvl) => !occupiedLevelIds.has(lvl.id));

  // Pick target level: prefer free, unoccupied landmark to guarantee zero collision!
  let chosenLevel = null;
  if (freeUnoccupiedLevels.length > 0) {
    // Pick randomly from free pool for uniform geographic dispersion across campus
    const randomIndex = Math.floor(Math.random() * freeUnoccupiedLevels.length);
    chosenLevel = freeUnoccupiedLevels[randomIndex];
  } else {
    // Graceful fallback: pick from unvisited with earliest unlocked time (least congested)
    chosenLevel = unvisitedLevels[Math.floor(Math.random() * unvisitedLevels.length)];
  }

  const nextProgress = await prisma.teamLevelProgress.create({
    data: {
      teamId,
      levelId: chosenLevel.id,
      stepNumber: nextStepNumber,
      unlockedAt: new Date(),
    },
  });

  if (chosenLevel.durationSecs) {
    const deadline = nextProgress.unlockedAt.getTime() + chosenLevel.durationSecs * 1000;
    scheduleTeamLevelTimer(io, nextProgress.id, teamId, chosenLevel.id, deadline);
  }

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
 * Returns the live status of all clue landmarks and which team is currently occupying each one.
 * Powers the real-time collision-free monitor in the Admin Command Desk.
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
