import { Server } from 'socket.io';

/**
 * Stopwatch Engine:
 * In the stopwatch model, all teams start at 00:00:00 and race to complete clues at their own pace.
 * Levels do NOT auto-unlock on a timer expiry. Hint and zone penalties are added to the team's final time.
 */

export function scheduleTeamLevelTimer(
  _io: Server,
  _progressId: number,
  _teamId: number,
  _levelId: number,
  _deadlineMs: number,
) {
  // No-op: Clues do not auto-unlock on timeout
}

export function cancelTeamLevelTimer(_progressId: number) {
  // No-op
}

export async function rescheduleTimers(_io: Server) {
  // No-op in stopwatch model
}
