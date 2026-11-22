import { useEffect, useState } from 'react';

/**
 * Legacy countdown timer helper for any fixed deadline.
 */
export function useCountdown(targetMs: number | null, pausedAt: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (targetMs === null) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      if (pausedAt !== null) {
        setRemaining(Math.max(0, targetMs - pausedAt));
        return;
      }
      setRemaining(Math.max(0, targetMs - Date.now()));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, pausedAt]);

  return remaining;
}

/**
 * Global Stopwatch Timer Hook:
 * Counts UP from 00:00:00 starting at `startedAt`.
 * Freezes at `pausedAt`, accounts for accumulated `totalPausedMs`,
 * and stops at `endedAt` if game has finished.
 */
export function useStopwatch(
  startedAt: string | Date | null | undefined,
  pausedAt: string | Date | null | undefined,
  totalPausedMs: number = 0,
  endedAt?: string | Date | null | undefined,
): { elapsedMs: number; formatted: string } {
  const [now, setNow] = useState(Date.now());

  const isTicking = Boolean(startedAt && !pausedAt && !endedAt);

  useEffect(() => {
    if (!isTicking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTicking, startedAt, pausedAt, endedAt]);

  if (!startedAt) {
    return { elapsedMs: 0, formatted: '00:00' };
  }

  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt
    ? new Date(endedAt).getTime()
    : pausedAt
    ? new Date(pausedAt).getTime()
    : now;

  const elapsedMs = Math.max(0, endMs - startMs - (totalPausedMs || 0));
  return { elapsedMs, formatted: formatMs(elapsedMs) };
}

export function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
