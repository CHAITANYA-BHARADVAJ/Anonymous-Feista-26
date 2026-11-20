import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { formatMs } from '../../hooks/useCountdown';

export default function Leaderboard() {
  const rankings = useGameStore((s) => s.rankings);
  const currentTeamId = useAuthStore((s) => s.teamId);

  return (
    <div className="flex flex-col px-5 py-6 gap-5 pb-24 font-sans max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            LIVE TELEMETRY BOARD
          </span>
          <h1 className="text-xl font-black tracking-tight text-white mt-0.5">Official Standings</h1>
        </div>

        <span className="text-[10px] font-mono tracking-wider uppercase bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-md">
          {rankings.length} SQUADS ACTIVE
        </span>
      </div>

      {rankings.length === 0 ? (
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-10 text-center text-gray-500 text-xs font-mono">
          STANDINGS COMPILING AS SQUADS ADVANCE PAST CHECKPOINTS…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rankings.map((r) => {
            const isSelf = r.teamId === currentTeamId;
            const isFinished = r.finished;

            const rankStyle =
              r.rank === 1
                ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                : r.rank === 2
                ? 'bg-slate-300/15 text-slate-200 border-slate-300/30'
                : r.rank === 3
                ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.08]';

            return (
              <div
                key={r.teamId}
                className={`rounded-2xl p-3.5 flex items-center gap-3 border transition-all ${
                  isSelf
                    ? 'bg-cyan-950/20 border-cyan-400/40 shadow-lg shadow-cyan-400/5'
                    : 'bg-[#0c0e14] border-white/[0.06] hover:border-white/15'
                }`}
              >
                {/* Position Marker */}
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center font-mono font-black text-sm shrink-0 ${rankStyle}`}>
                  {r.rank}
                </div>

                {/* Team Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-white truncate tracking-tight">
                      {r.teamName}
                    </p>
                    {isSelf && (
                      <span className="text-[9px] font-mono uppercase bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 px-1.5 py-0.2 rounded font-bold">
                        YOU
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-mono">
                    <span>
                      {isFinished ? '🏁 FINISHED' : `STAGE 0${r.currentLevel ?? 1}`}
                    </span>
                  </div>
                </div>

                {/* Adjusted Time Column */}
                <div className="text-right shrink-0">
                  <span className="text-sm font-mono font-black text-white tabular-nums tracking-tight">
                    {r.adjustedTimeSecs ? formatMs(r.adjustedTimeSecs * 1000) : 'IN PLAY'}
                  </span>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-gray-500">
                    {isFinished ? 'FINAL TIME' : 'ELAPSED'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
