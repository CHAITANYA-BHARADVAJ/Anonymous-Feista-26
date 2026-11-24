import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';
import { playZoneWarningAlarm, triggerHaptic } from '../lib/sound';
import { announceZoneBreach } from '../lib/voice';
import { useVoiceStore } from '../stores/voiceStore';
import { ShieldAlertIcon } from './Icons';

export default function ZoneWarning() {
  const [warning, setWarning] = useState<{ label: string | null; penaltyMins: number } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on('zone:entered', (data: { label: string | null; penaltyMins: number }) => {
      setWarning(data);
      if (useVoiceStore.getState().muted) {
        playZoneWarningAlarm();
      } else {
        announceZoneBreach(data.label, data.penaltyMins);
      }
      triggerHaptic([300, 150, 300, 150, 300]);
      setTimeout(() => setWarning(null), 9000);
    });
    return () => {
      socket.off('zone:entered');
    };
  }, []);

  if (!warning) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md p-5 animate-fade-in select-none font-sans"
    >
      <div className="bg-[#0c0e14]/95 border border-rose-500/50 rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_24px_60px_rgba(225,29,72,0.28)] flex flex-col items-center gap-4 animate-scale-in">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 animate-pulse">
          <ShieldAlertIcon className="w-7 h-7" />
        </div>

        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400 font-bold block">
            GEOFENCE BREACH DETECTED
          </span>
          <h2 className="text-xl font-black text-white tracking-tight mt-1">Restricted Sector</h2>
          <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
            {warning.label
              ? `Your squad crossed into "${warning.label}". Leave this area immediately.`
              : 'Your squad entered a restricted off-limits area. Leave immediately.'}
          </p>
        </div>

        <div className="w-full py-2 px-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 font-mono text-xs font-bold tabular-nums">
          +{warning.penaltyMins} minute penalty applied
        </div>

        <button
          onClick={() => setWarning(null)}
          className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 active:scale-[0.98] text-zinc-950 font-black text-xs uppercase tracking-widest transition-all min-h-[46px] shadow-xl"
        >
          Acknowledge & Exit Zone
        </button>
      </div>
    </div>
  );
}
