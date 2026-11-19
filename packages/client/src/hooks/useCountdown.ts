import { useEffect, useState } from 'react';

export function useCountdown(targetMs: number | null, pausedAt: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (targetMs === null) { setRemaining(0); return; }

    const tick = () => {
      if (pausedAt !== null) {
        // Frozen — compute remaining at pause moment
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

export function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
