import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { playAnnouncementSound, triggerHaptic } from '../lib/sound';

export default function AnnouncementBanner() {
  const announcements = useGameStore((s) => s.announcements);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const latest = announcements[0];
  const msgKey = latest ? `${latest.sentAt}-${latest.message}` : null;
  const isVisible = Boolean(latest && msgKey !== dismissedId);

  useEffect(() => {
    if (latest && msgKey && msgKey !== dismissedId) {
      playAnnouncementSound();
      triggerHaptic([150, 80, 150, 80, 300]);

      // Auto-dismiss notification after 15 seconds
      const timer = setTimeout(() => {
        setDismissedId(msgKey);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [msgKey, dismissedId]);

  if (!isVisible || !latest) return null;

  const isNudge = latest.kind === 'nudge';

  return (
    <div className="fixed top-14 inset-x-3 z-[1300] max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div
        className={`rounded-2xl p-4 shadow-2xl backdrop-blur-2xl border ${
          isNudge
            ? 'bg-amber-950/95 border-amber-500/60 shadow-amber-950/50'
            : 'bg-zinc-950/95 border-cyan-400/60 shadow-cyan-950/50'
        } flex items-start gap-3 relative`}
      >
        {/* Pulsing Signal Dot */}
        <div className="pt-0.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
              isNudge
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            }`}
          >
            {isNudge ? '⚠️' : '📡'}
          </div>
        </div>

        {/* Transmission Content */}
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[9px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                isNudge
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-cyan-500/20 text-cyan-300'
              }`}
            >
              {isNudge ? 'DIRECT SQUAD NUDGE' : 'EVENT CONTROL BROADCAST'}
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {latest.sentAt ? new Date(latest.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'NOW'}
            </span>
          </div>

          <p className="text-xs font-mono font-medium text-white leading-relaxed break-words">
            {latest.message}
          </p>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={() => setDismissedId(msgKey)}
          className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-mono transition-colors"
          title="Dismiss Transmission"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
