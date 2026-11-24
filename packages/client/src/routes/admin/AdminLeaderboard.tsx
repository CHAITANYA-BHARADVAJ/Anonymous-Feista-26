import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminLeaderboard() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    const socket = getSocket();

    socket.on('leaderboard:updated', (data: any) => {
      if (data?.rankings) setRankings(data.rankings);
    });

    socket.on('winner:declared', () => {
      loadData();
    });

    return () => {
      socket.off('leaderboard:updated');
      socket.off('winner:declared');
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [board, games] = await Promise.all([api.getLeaderboard(), api.getGames()]);
      setRankings(board.rankings ?? []);
      setGame(games[0] ?? null);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(secs: number | null): string {
    if (secs == null) return '—';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}m ${s}s`;
  }

  function exportCSV() {
    if (rankings.length === 0) return;
    const headers = ['Rank', 'Team Name', 'Status', 'Current Level', 'Adjusted Time (Secs)', 'Formatted Time'];
    const rows = rankings.map((r) => [
      r.rank,
      `"${r.teamName}"`,
      r.finished ? 'Finished' : 'In Field',
      `Level ${r.currentLevel}`,
      r.adjustedTimeSecs ?? '',
      formatTime(r.adjustedTimeSecs),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SDMCET_Campus_Hunt_Results_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const finishedTeams = rankings.filter((r) => r.finished);
  const podium = finishedTeams.slice(0, 3);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* Top Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Standings & Podium</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Official adjusted finish times (Elapsed + Hint & Zone Penalties − Checkpoint Bonuses).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={rankings.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Podium Cards */}
      {podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1st Place (Center on desktop) */}
          {podium[0] && (
            <div className="bg-gradient-to-b from-amber-500/[0.08] to-zinc-900/80 border border-amber-500/40 rounded-2xl p-5 flex flex-col justify-between order-1 md:order-2 shadow-xl shadow-amber-950/20">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 uppercase font-bold tracking-wider">
                  1st Place • Champion
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">{podium[0].teamName}</h3>
                <p className="text-xs font-mono text-zinc-300 mt-1">
                  Adjusted Time: <strong className="text-amber-300 font-bold">{formatTime(podium[0].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 mt-4 pt-2.5 border-t border-amber-500/20 flex items-center gap-1.5 font-bold">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Verified Finish
              </span>
            </div>
          )}

          {/* 2nd Place */}
          {podium[1] && (
            <div className="bg-gradient-to-b from-zinc-400/[0.05] to-zinc-900/60 border border-zinc-700/80 rounded-2xl p-5 flex flex-col justify-between order-2 md:order-1 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                  <span className="text-xs font-mono font-bold">#2</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase font-semibold">
                  2nd Place • Runner-Up
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">{podium[1].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-1">
                  Adjusted Time: <strong className="text-zinc-200">{formatTime(podium[1].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-4 pt-2.5 border-t border-zinc-800 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Verified Finish
              </span>
            </div>
          )}

          {/* 3rd Place */}
          {podium[2] && (
            <div className="bg-gradient-to-b from-amber-700/[0.05] to-zinc-900/60 border border-amber-800/40 rounded-2xl p-5 flex flex-col justify-between order-3 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400">
                  <span className="text-xs font-mono font-bold">#3</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-amber-800/40 uppercase font-semibold">
                  3rd Place • Bronze
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">{podium[2].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-1">
                  Adjusted Time: <strong className="text-zinc-200">{formatTime(podium[2].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-4 pt-2.5 border-t border-zinc-800 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Verified Finish
              </span>
            </div>
          )}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-100 flex items-center justify-between">
          <span>Event Standings</span>
          <span className="text-[11px] font-mono text-zinc-500 font-normal">{rankings.length} Teams Registered</span>
        </h3>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs animate-pulse">
            COMPUTING LIVE STANDINGS…
          </div>
        ) : rankings.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">
            NO TEAMS REGISTERED IN GAME YET.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Team Call-Sign</th>
                  <th className="py-2.5 px-3">Field Status</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3 text-right">Penalties</th>
                  <th className="py-2.5 px-3 text-right">Adjusted Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rankings.map((team, idx) => {
                  const isTopThree = idx < 3 && team.finished;
                  return (
                    <tr
                      key={team.teamId}
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        isTopThree ? 'bg-amber-500/[0.02]' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-bold">
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs tabular-nums ${
                            idx === 0 && team.finished
                              ? 'bg-amber-500/20 text-amber-300 font-black border border-amber-500/30'
                              : idx === 1 && team.finished
                              ? 'bg-zinc-700/50 text-zinc-200 border border-zinc-600'
                              : idx === 2 && team.finished
                              ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40'
                              : 'text-zinc-500'
                          }`}
                        >
                          #{team.rank}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-white tracking-tight">{team.teamName}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                            team.finished
                              ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300'
                              : 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300'
                          }`}
                        >
                          {team.finished ? 'Verified Finish' : 'Active In Field'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {team.finished ? (
                          <span className="text-zinc-500">All Completed</span>
                        ) : (
                          `Stage ${team.currentLevel}`
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-400 tabular-nums">
                        {team.totalPenaltyMins > 0 ? (
                          <span className="text-rose-400">+{team.totalPenaltyMins}m</span>
                        ) : (
                          <span className="text-zinc-600">0m</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-white tabular-nums">
                        {formatTime(team.adjustedTimeSecs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
