import { useGameStore } from '../../stores/gameStore';
import { useCountdown, formatMs } from '../../hooks/useCountdown';
import { useNavigate } from 'react-router-dom';
import { RadarIcon, IntelIcon, ChevronRightIcon } from '../../components/Icons';

export default function Home() {
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const progress = useGameStore((s) => s.progress);
  const navigate = useNavigate();

  const levelDeadlineMs =
    currentLevel?.level.durationSecs && currentLevel.unlockedAt && game?.status === 'running'
      ? new Date(currentLevel.unlockedAt).getTime() +
        currentLevel.level.durationSecs * 1000 +
        (game?.totalPausedMs ?? 0)
      : null;

  const levelRemaining = useCountdown(
    levelDeadlineMs,
    game?.pausedAt ? new Date(game.pausedAt).getTime() : null,
  );

  const completedCount = progress.filter((p) => p.completedAt).length;
  const totalLevels = Math.max(progress.length, 3);

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-20 text-center font-sans">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-cyan-400 mb-4">
          <RadarIcon className="w-6 h-6 animate-spin" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-1">SDMCET Campus Hunt</h1>
        <p className="text-xs text-gray-400 max-w-xs font-mono">Synchronizing telemetry with event coordinators…</p>
      </div>
    );
  }

  const statusBadges: Record<string, { label: string; style: string; dot: string }> = {
    idle: { label: 'STANDBY', style: 'border-white/10 text-gray-400 bg-white/5', dot: 'bg-gray-400' },
    running: { label: 'FIELD ACTIVE', style: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10', dot: 'bg-emerald-400 animate-pulse' },
    paused: { label: 'TIMERS PAUSED', style: 'border-amber-500/30 text-amber-300 bg-amber-500/10', dot: 'bg-amber-400' },
    ended: { label: 'EVENT CONCLUDED', style: 'border-red-500/30 text-red-300 bg-red-500/10', dot: 'bg-red-400' },
  };

  const badge = statusBadges[game.status] ?? statusBadges.idle;

  return (
    <div className="flex flex-col px-5 py-6 gap-5 pb-20 font-sans">
      {/* Tactical Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            SECTOR: SDMCET DHARWAD
          </span>
          <h1 className="text-xl font-black tracking-tight text-white mt-0.5">
            {game.name || 'Campus Hunt 2026'}
          </h1>
        </div>

        <div className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] font-bold flex items-center gap-1.5 ${badge.style}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          <span>{badge.label}</span>
        </div>
      </div>

      {/* Primary Mission Card */}
      {currentLevel ? (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 flex flex-col gap-5 shadow-2xl relative overflow-hidden">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-md">
              ACTIVE OBJECTIVE #{currentLevel.level.orderIndex}
            </span>
            <span className="text-[11px] font-mono text-gray-400">
              {completedCount}/{totalLevels} CLEARED
            </span>
          </div>

          <div className="relative z-10">
            <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
              {currentLevel.level.title}
            </h2>
            <p className="text-xs text-gray-300 mt-2 leading-relaxed">
              {currentLevel.level.locationHint || currentLevel.level.clueText}
            </p>
          </div>

          {/* Precision Timer Box */}
          {currentLevel.level.durationSecs && !currentLevel.completedAt && (
            <div className="bg-[#07080b] rounded-2xl p-4 border border-white/[0.08] flex items-center justify-between relative z-10">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-gray-500 font-bold">
                  TARGET LOCK COUNTDOWN
                </p>
                <p
                  className={`text-3xl font-mono font-black tracking-tight mt-0.5 tabular-nums ${
                    levelRemaining < 60000 ? 'text-red-400 animate-pulse' : 'text-white'
                  }`}
                >
                  {formatMs(levelRemaining)}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                  TIME LIMIT
                </span>
                <p className="text-sm font-mono text-gray-300 font-bold">
                  {Math.round(currentLevel.level.durationSecs / 60)} MINS
                </p>
              </div>
            </div>
          )}

          {currentLevel.completedAt && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 text-center text-emerald-300 text-xs font-mono font-bold tracking-wide relative z-10">
              ✓ OBJECTIVE COMPLETED — ADVANCE TO NEXT COORDINATE
            </div>
          )}

          {/* Action Triggers */}
          <div className="grid grid-cols-2 gap-3 pt-1 relative z-10">
            <button
              onClick={() => navigate('../map')}
              className="py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-400/20 transition-all flex items-center justify-center gap-2 min-h-[46px]"
            >
              <RadarIcon className="w-4 h-4" />
              <span>Launch Radar</span>
            </button>

            <button
              onClick={() => navigate('../clues')}
              className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 min-h-[46px]"
            >
              <IntelIcon className="w-4 h-4 text-gray-400" />
              <span>View Intel</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-8 text-center text-gray-400 text-xs">
          {game.status === 'idle'
            ? 'Awaiting command start from event coordinators.'
            : 'All objectives completed! Sprint to Start Venue to verify victory!'}
        </div>
      )}

      {/* Campaign Milestones Visual Strip */}
      <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400 font-bold">
            MISSION PROGRESSION
          </span>
          <span className="font-mono text-[11px] text-cyan-400 font-bold">
            {Math.round((completedCount / totalLevels) * 100)}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: totalLevels }).map((_, i) => {
            const isDone = i < completedCount;
            const isCurrent = i === completedCount;

            return (
              <div
                key={i}
                className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                  isDone
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold'
                    : isCurrent
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 font-bold'
                    : 'bg-white/[0.02] border-white/[0.06] text-gray-600'
                }`}
              >
                <div className="text-[9px] font-mono uppercase tracking-widest">STAGE 0{i + 1}</div>
                <div className="text-[11px] font-mono mt-0.5">
                  {isDone ? 'CLEARED' : isCurrent ? 'ENGAGED' : 'LOCKED'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field Advisories */}
      {game.status === 'paused' && (
        <div className="p-4 rounded-2xl bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs font-mono font-medium text-center">
          ⏸ EVENT TEMPORARILY PAUSED BY COORDINATOR. ALL TIMERS FROZEN.
        </div>
      )}

      {game.status === 'ended' && (
        <div className="p-4 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-300 text-xs font-mono font-medium text-center">
          🏁 EVENT CONCLUDED. PROCEED TO AUDITORIUM FOR FINAL WINNERS CEREMONY.
        </div>
      )}
    </div>
  );
}
