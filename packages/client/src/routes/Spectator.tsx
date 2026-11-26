import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { formatMs, useStopwatch } from '../hooks/useCountdown';
import { Ranking } from '../stores/gameStore';
import { toggleFullscreen, enableAutoFullscreenOnFirstGesture } from '../lib/fullscreen';
import { CheckIcon, ClockIcon, MaximizeIcon, RadarIcon, TrophyIcon } from '../components/Icons';
import SquadBreakdownModal, { formatDurationSecs } from '../components/SquadBreakdownModal';

export default function Spectator() {
  const [state, setState] = useState<any>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const { formatted: elapsedFormatted } = useStopwatch(
    state?.game?.startedAt,
    state?.game?.pausedAt,
    state?.game?.totalPausedMs ?? 0,
    state?.game?.endedAt,
  );

  useEffect(() => {
    const cleanupFs = enableAutoFullscreenOnFirstGesture();
    const fetchState = () => api.getSpectatorState().then(setState).catch(() => {});
    fetchState();

    const socket = getSocket();
    socket.emit('join:spectator');
    socket.on('connect', () => {
      socket.emit('join:spectator');
      fetchState();
    });
    socket.on('leaderboard:updated', ({ rankings }: any) =>
      setState((s: any) => (s ? { ...s, rankings } : s)),
    );
    const handleStatus = (data: any) =>
      setState((s: any) => (s ? { ...s, game: { ...s.game, ...(data.game || data) } } : s));
    socket.on('game:status_changed', handleStatus);
    socket.on('game:status', handleStatus);
    socket.on('game:started', handleStatus);
    socket.on('game:announcement', (a: any) =>
      setState((s: any) => (s ? { ...s, announcements: [a, ...(s.announcements ?? [])].slice(0, 5) } : s)),
    );
    return () => {
      cleanupFs();
      socket.off('connect');
      socket.off('leaderboard:updated');
      socket.off('game:status_changed', handleStatus);
      socket.off('game:status', handleStatus);
      socket.off('game:started', handleStatus);
      socket.off('game:announcement');
    };
  }, []);

  const rankings: Ranking[] = state?.rankings ?? [];
  const selectedRanking = useMemo(
    () => (selectedTeamId != null ? rankings.find((r) => r.teamId === selectedTeamId) ?? null : null),
    [rankings, selectedTeamId],
  );

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#07080b] text-white font-mono text-sm">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl obsidian-surface">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="tracking-wider uppercase text-xs text-zinc-300">Synchronizing Spectator Telemetry…</span>
        </div>
      </div>
    );
  }

  const statusStyles: Record<string, string> = {
    running: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
    paused: 'bg-amber-500/15 border-amber-500/35 text-amber-300',
    ended: 'bg-rose-500/15 border-rose-500/35 text-rose-300',
    idle: 'bg-white/5 border-white/10 text-zinc-400',
  };

  const dotStyles: Record<string, string> = {
    running: 'bg-emerald-400 animate-pulse',
    paused: 'bg-amber-400',
    ended: 'bg-rose-400',
    idle: 'bg-zinc-500',
  };

  const statusKey = state.game?.status ?? 'idle';
  const statusStyle = statusStyles[statusKey] ?? statusStyles.idle;
  const dotStyle = dotStyles[statusKey] ?? dotStyles.idle;
  const finishedCount = rankings.filter((r) => r.finished).length;
  const racingCount = rankings.filter((r) => !r.finished && r.currentLevel > 0).length;

  return (
    <div className="min-h-[100dvh] bg-[#07080b] text-gray-100 p-6 md:p-8 lg:p-10 flex flex-col gap-6 max-w-6xl mx-auto select-none">
      {/* Big Screen Header */}
      <header className="flex flex-col items-center justify-center text-center gap-2 relative pt-8 sm:pt-0">
        <button
          onClick={() => toggleFullscreen()}
          className="absolute right-0 top-0 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition-all active:scale-95"
          title="Toggle Fullscreen Projection"
        >
          <MaximizeIcon className="w-3.5 h-3.5" />
          <span>Fullscreen</span>
        </button>

        <div className="w-14 h-14 rounded-2xl bg-[#0c0e14] border border-white/10 p-2 flex items-center justify-center shadow-2xl mb-1">
          <img src="/logo.png" alt="Anonymous SDMCET" className="w-full h-full object-contain filter drop-shadow" />
        </div>
        <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-400 font-bold">
          ANONYMOUS SDMCET • OFFICIAL LIVE TELEMETRY
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
          {state.game?.name ?? 'Campus Hunt'}
        </h1>

        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
          <span
            className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-widest border flex items-center gap-2 ${statusStyle}`}
          >
            <span className={`w-2 h-2 rounded-full ${dotStyle}`} />
            <span>{state.game?.status ?? 'WAITING'}</span>
          </span>
          {state.game?.startedAt && (
            <span className="px-4 py-1.5 rounded-full text-xs font-mono font-black tabular-nums tracking-widest obsidian-surface text-cyan-300 flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>{elapsedFormatted}</span>
            </span>
          )}
          <span className="px-4 py-1.5 rounded-full text-xs font-mono font-bold obsidian-surface text-zinc-300 tabular-nums">
            {finishedCount} Finished • {racingCount} Racing • {rankings.length} Total
          </span>
        </div>
      </header>

      {/* Live Broadcast Ticker */}
      {state.announcements?.length > 0 && (
        <div className="obsidian-surface border-cyan-500/35 rounded-3xl p-4 sm:p-5 text-center animate-slide-down flex items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
            <RadarIcon className="w-4 h-4" />
          </div>
          <span className="text-base lg:text-lg font-bold text-white tracking-tight">
            {state.announcements[0].message}
          </span>
        </div>
      )}

      {/* Main High-Impact Leaderboard Table */}
      <div className="obsidian-surface rounded-[28px] overflow-hidden">
        <div className="px-6 py-3 border-b border-white/[0.06] bg-white/[0.01] flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span>LIVE LEADERBOARD STANDINGS</span>
          <span className="text-cyan-400">Click any squad for detailed stage splits &amp; time audit</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
                <th className="py-4 px-5 sm:px-6">Rank</th>
                <th className="py-4 px-5 sm:px-6">Team Identity</th>
                <th className="py-4 px-5 sm:px-6">Progress</th>
                <th className="py-4 px-5 sm:px-6 text-right">Penalties</th>
                <th className="py-4 px-5 sm:px-6 text-right">Adjusted Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rankings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-xs font-mono text-zinc-500">
                    NO SQUADS REGISTERED ON LIVE BOARD YET.
                  </td>
                </tr>
              )}
              {rankings.map((r) => {
                const isFirst = r.rank === 1;
                const isSecond = r.rank === 2;
                const isThird = r.rank === 3;
                const totalSteps = r.totalSteps || 11;
                const completedStages = r.completedStages ?? 0;
                const pct = Math.min(100, Math.round((completedStages / totalSteps) * 100));
                const netMins = r.netAdjustmentMins ?? 0;

                const rankDisplay = isFirst ? (
                  <div className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-base flex items-center justify-center shadow-lg shadow-amber-500/10 tabular-nums">
                      <TrophyIcon className="w-4 h-4" />
                    </span>
                    <span className="hidden sm:inline text-[11px] font-mono text-amber-300 font-bold uppercase tracking-wider">
                      #1 Leader
                    </span>
                  </div>
                ) : isSecond ? (
                  <span className="w-10 h-10 rounded-2xl bg-zinc-400/15 border border-zinc-400/35 text-zinc-200 font-black text-base flex items-center justify-center tabular-nums">
                    2
                  </span>
                ) : isThird ? (
                  <span className="w-10 h-10 rounded-2xl bg-amber-800/25 border border-amber-700/40 text-amber-400 font-black text-base flex items-center justify-center tabular-nums">
                    3
                  </span>
                ) : (
                  <span className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-zinc-400 font-mono font-bold text-sm flex items-center justify-center tabular-nums">
                    #{r.rank}
                  </span>
                );

                return (
                  <tr
                    key={r.teamId}
                    onClick={() => setSelectedTeamId(r.teamId)}
                    className={`transition-colors cursor-pointer group ${
                      isFirst ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <td className="py-4 px-5 sm:px-6">{rankDisplay}</td>
                    <td className="py-4 px-5 sm:px-6">
                      <p className="font-extrabold text-base sm:text-xl text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                        {r.teamName}
                      </p>
                      {r.finished ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 font-mono mt-0.5">
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>Verified Finish</span>
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-zinc-400 block mt-0.5 truncate max-w-[210px]">
                          {r.currentStageTitle}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 sm:px-6 min-w-[160px]">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-zinc-300 font-bold tabular-nums">
                            {completedStages}/{totalSteps} Cleared
                          </span>
                          <span className="text-zinc-500 tabular-nums">{pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-zinc-900/90 border border-white/[0.07] overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              r.finished ? 'bg-emerald-400' : 'bg-cyan-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 sm:px-6 text-right font-mono tabular-nums">
                      {netMins > 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold">
                          +{netMins}m
                        </span>
                      ) : netMins < 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold">
                          {netMins}m
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">Clean</span>
                      )}
                    </td>
                    <td className="py-4 px-5 sm:px-6 text-right font-mono tabular-nums">
                      {r.finished && r.adjustedTimeSecs != null ? (
                        <div>
                          <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight block">
                            {formatMs(r.adjustedTimeSecs * 1000)}
                          </span>
                          <span className="text-[10px] text-zinc-500 block">
                            Base {formatDurationSecs(r.rawElapsedSecs)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm font-medium text-cyan-300/80 group-hover:text-cyan-300">
                          View Splits →
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Credit */}
      <footer className="text-center py-4 border-t border-white/[0.08] text-xs font-mono text-zinc-500 tracking-wider">
        Designed and developed by <span className="text-cyan-400 font-semibold">Anonymous_SDMCET</span>
      </footer>

      <SquadBreakdownModal
        ranking={selectedRanking}
        onClose={() => setSelectedTeamId(null)}
      />
    </div>
  );
}
