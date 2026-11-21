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
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-all flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>

          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Podium Cards */}
      {podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {podium[0] && (
            <div className="bg-zinc-900/80 border border-zinc-700 rounded-2xl p-4 flex flex-col justify-between order-1 md:order-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">🥇</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 uppercase font-bold">
                  1st Place
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{podium[0].teamName}</h3>
                <p className="text-xs font-mono text-zinc-300 mt-0.5">
                  Adjusted Time: <strong className="text-white">{formatTime(podium[0].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 mt-3 pt-2 border-t border-zinc-800">
                Verified Finish
              </span>
            </div>
          )}

          {podium[1] && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between order-2 md:order-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">🥈</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">
                  2nd Place
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{podium[1].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                  Adjusted Time: <strong className="text-zinc-200">{formatTime(podium[1].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 mt-3 pt-2 border-t border-zinc-800">
                Verified Finish
              </span>
            </div>
          )}

          {podium[2] && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between order-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">🥉</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase">
                  3rd Place
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{podium[2].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                  Adjusted Time: <strong className="text-zinc-200">{formatTime(podium[2].adjustedTimeSecs)}</strong>
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 mt-3 pt-2 border-t border-zinc-800">
                Verified Finish
              </span>
            </div>
          )}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-100">Event Standings ({rankings.length} Teams)</h3>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">COMPUTING STANDINGS…</div>
        ) : rankings.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">NO TEAMS IN GAME YET.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Team</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3 text-right">Adjusted Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rankings.map((r) => (
                  <tr
                    key={r.teamId}
                    className={`hover:bg-zinc-800/30 transition-colors ${
                      r.finished ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-bold">
                      {r.rank === 1 ? '🥇 1' : r.rank === 2 ? '🥈 2' : r.rank === 3 ? '🥉 3' : `#${r.rank}`}
                    </td>
                    <td className="py-3 px-3 font-semibold text-white font-sans text-sm">
                      {r.teamName}
                    </td>
                    <td className="py-3 px-3">
                      {r.finished ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                          Finished
                        </span>
                      ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                          In Field
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {r.finished ? 'All Cleared' : `Objective ${r.currentLevel}`}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-zinc-100 text-sm">
                      {formatTime(r.adjustedTimeSecs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
