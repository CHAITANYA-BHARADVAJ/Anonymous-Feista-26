import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { formatMs } from '../hooks/useCountdown';

export default function Spectator() {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    api.getSpectatorState().then(setState);
    const socket = getSocket();
    socket.emit('join:spectator');
    socket.on('leaderboard:updated', ({ rankings }: any) =>
      setState((s: any) => (s ? { ...s, rankings } : s)),
    );
    socket.on('game:status_changed', (data: any) =>
      setState((s: any) => (s ? { ...s, game: { ...s.game, ...data } } : s)),
    );
    socket.on('game:announcement', (a: any) =>
      setState((s: any) => (s ? { ...s, announcements: [a, ...(s.announcements ?? [])].slice(0, 5) } : s)),
    );
    return () => {
      socket.off('leaderboard:updated');
      socket.off('game:status_changed');
      socket.off('game:announcement');
    };
  }, []);

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-graphite-950 text-white font-mono text-lg">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-brand-400 animate-ping" />
          <span>Synchronizing Spectator Telemetry…</span>
        </div>
      </div>
    );
  }

  const statusStyles: Record<string, string> = {
    running: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    paused: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    ended: 'bg-red-500/15 border-red-500/30 text-red-300',
    idle: 'bg-white/5 border-white/10 text-gray-400',
  };

  const statusStyle = statusStyles[state.game?.status] ?? statusStyles.idle;

  return (
    <div className="min-h-screen bg-graphite-950 text-gray-100 p-8 lg:p-12 flex flex-col gap-8 max-w-6xl mx-auto select-none">
      {/* Big Screen Header */}
      <header className="flex flex-col items-center justify-center text-center gap-2 relative">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 p-2 flex items-center justify-center shadow-xl mb-1">
          <img src="/logo.png" alt="Anonymous SDMCET" className="w-full h-full object-contain filter drop-shadow" />
        </div>
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-brand-400 font-bold">
          ANONYMOUS SDMCET • OFFICIAL LIVE TELEMETRY
        </span>
        <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-white">
          {state.game?.name ?? 'Campus Hunt'}
        </h1>

        <span
          className={`mt-2 px-5 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-widest border ${statusStyle}`}
        >
          ● {state.game?.status ?? 'WAITING'}
        </span>
      </header>

      {/* Live Broadcast Ticker */}
      {state.announcements?.length > 0 && (
        <div className="glass-card border border-brand-500/30 bg-brand-950/40 rounded-3xl p-5 text-center shadow-2xl animate-fade-in flex items-center justify-center gap-3">
          <span className="text-xl">📢</span>
          <span className="text-lg lg:text-xl font-bold text-white tracking-tight">
            {state.announcements[0].message}
          </span>
        </div>
      )}

      {/* Main High-Impact Leaderboard Table */}
      <div className="glass-card rounded-[32px] overflow-hidden border border-white/10 shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs font-mono text-gray-400 uppercase tracking-widest">
              <th className="py-5 px-6">Rank</th>
              <th className="py-5 px-6">Team Identity</th>
              <th className="py-5 px-6 text-center">Progress</th>
              <th className="py-5 px-6 text-right">Adjusted Finish Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {state.rankings?.map((r: any) => {
              const isFirst = r.rank === 1;
              const isSecond = r.rank === 2;
              const isThird = r.rank === 3;

              const rankDisplay = isFirst ? (
                <div className="flex items-center gap-2">
                  <span className="w-10 h-10 rounded-2xl bg-gold-500/20 border border-gold-500/40 text-gold-300 font-black text-lg flex items-center justify-center shadow-lg shadow-gold-500/10">
                    1
                  </span>
                  <span className="text-xs font-mono text-gold-400 font-bold uppercase tracking-wider">Leader</span>
                </div>
              ) : isSecond ? (
                <span className="w-10 h-10 rounded-2xl bg-slate-300/15 border border-slate-300/30 text-slate-200 font-black text-lg flex items-center justify-center">
                  2
                </span>
              ) : isThird ? (
                <span className="w-10 h-10 rounded-2xl bg-amber-700/20 border border-amber-600/30 text-amber-400 font-black text-lg flex items-center justify-center">
                  3
                </span>
              ) : (
                <span className="w-10 h-10 rounded-2xl bg-white/5 text-gray-400 font-mono font-bold text-base flex items-center justify-center">
                  #{r.rank}
                </span>
              );

              return (
                <tr
                  key={r.teamId}
                  className={`transition-colors ${
                    isFirst
                      ? 'bg-gold-500/[0.04]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <td className="py-5 px-6">{rankDisplay}</td>
                  <td className="py-5 px-6">
                    <p className="font-extrabold text-xl text-white tracking-tight">{r.teamName}</p>
                    {r.finished && (
                      <span className="text-xs font-semibold text-emerald-400 font-mono">
                        ✓ In-Person Verified Finish
                      </span>
                    )}
                  </td>
                  <td className="py-5 px-6 text-center">
                    <span className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-mono text-gray-300 font-bold">
                      Level {r.currentLevel}
                    </span>
                  </td>
                  <td className="py-5 px-6 text-right font-mono">
                    {r.finished && r.adjustedTimeSecs != null ? (
                      <span className="text-2xl font-black text-emerald-400 tracking-tight">
                        {formatMs(r.adjustedTimeSecs * 1000)}
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-gray-500">Racing in Field…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Credit */}
      <footer className="text-center py-4 border-t border-white/[0.08] text-xs font-mono text-gray-500 tracking-wider">
        Designed and developed by <span className="text-cyan-400 font-semibold">Anonymous_SDMCET</span>
      </footer>
    </div>
  );
}
