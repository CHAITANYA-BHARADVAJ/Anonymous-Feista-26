import { useVoiceStore } from '../stores/voiceStore';
import { announceArenaWelcome, primeSpeechEngine, stopPaVoice } from '../lib/voice';
import { SquidSymbolsIcon, VolumeOnIcon, XIcon } from './Icons';

interface PaVoiceBannerProps {
  teamName?: string | null;
}

export default function PaVoiceBanner({ teamName }: PaVoiceBannerProps) {
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const activeCaption = useVoiceStore((s) => s.activeCaption);
  const activeTone = useVoiceStore((s) => s.activeTone);
  const muted = useVoiceStore((s) => s.muted);
  const autoplayBlocked = useVoiceStore((s) => s.autoplayBlocked);

  const handleActivateAudio = () => {
    primeSpeechEngine();
    announceArenaWelcome(teamName);
  };

  if (autoplayBlocked && !muted && !isSpeaking) {
    return (
      <div className="fixed top-14 inset-x-3 z-[1260] max-w-md mx-auto animate-slide-down pointer-events-auto">
        <button
          type="button"
          onClick={handleActivateAudio}
          className="w-full bg-[#0c0e14]/95 hover:bg-zinc-900 border border-rose-500/45 rounded-2xl px-4 py-2.5 shadow-[0_12px_36px_rgba(244,63,94,0.2)] backdrop-blur-2xl flex items-center justify-between gap-3 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <VolumeOnIcon className="w-4 h-4" />
            </span>
            <div className="text-left min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400 font-bold flex items-center gap-1.5">
                <SquidSymbolsIcon className="w-5 h-2.5 text-rose-400" />
                <span>ARENA PA SYSTEM READY</span>
              </span>
              <p className="text-xs font-medium text-white truncate">
                Tap to hear Player Welcome &amp; Safety Briefing
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-black uppercase bg-rose-500 text-white px-2.5 py-1 rounded-lg shrink-0">
            Play
          </span>
        </button>
      </div>
    );
  }

  if (!isSpeaking || !activeCaption) return null;

  const toneBorder =
    activeTone === 'alert'
      ? 'border-rose-500/60 shadow-rose-950/40'
      : activeTone === 'finale'
      ? 'border-purple-400/55 shadow-purple-950/40'
      : activeTone === 'success'
      ? 'border-emerald-400/50 shadow-emerald-950/30'
      : 'border-rose-500/45 shadow-black/70';

  const toneAccent =
    activeTone === 'alert'
      ? 'text-rose-400'
      : activeTone === 'finale'
      ? 'text-purple-300'
      : activeTone === 'success'
      ? 'text-emerald-400'
      : 'text-rose-400';

  return (
    <div className="fixed top-14 inset-x-3 z-[1260] max-w-md mx-auto animate-slide-down pointer-events-auto">
      <div
        className={`bg-[#0c0e14]/95 backdrop-blur-2xl border rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-start gap-2.5 ${toneBorder}`}
      >
        {/* Minimal Squid-Game PA Indicator */}
        <div className={`pt-0.5 shrink-0 flex flex-col items-center gap-1 ${toneAccent}`}>
          <SquidSymbolsIcon className="w-6 h-3" />
          <div className="flex items-end gap-0.5 h-2.5">
            <span className="w-0.5 h-1.5 bg-current rounded-full animate-pulse" />
            <span className="w-0.5 h-2.5 bg-current rounded-full animate-pulse [animation-delay:120ms]" />
            <span className="w-0.5 h-1.5 bg-current rounded-full animate-pulse [animation-delay:240ms]" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className={`text-[9px] font-mono uppercase tracking-widest font-bold block ${toneAccent}`}>
            ARENA PA ANNOUNCER
          </span>
          <p className="text-[11px] font-mono text-zinc-200 leading-snug mt-0.5">
            {activeCaption}
          </p>
        </div>

        <button
          type="button"
          onClick={stopPaVoice}
          aria-label="Stop announcement audio"
          className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
