import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { Ranking } from '../../stores/gameStore';
import SquadBreakdownModal, { formatDurationSecs } from '../../components/SquadBreakdownModal';

export default function AdminLeaderboard() {
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'active'>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

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
      const board = await api.getLeaderboard();
      setRankings(board.rankings ?? []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (rankings.length === 0) return;
    const headers = [
      'Rank',
      'Team Name',
      'Status',
      'Completed Stages',
      'Total Steps',
      'Current Stage',
      'Hints Used',
      'Hint Penalties (m)',
      'Zone Penalties (m)',
      'Admin Adjustments (m)',
      'Bonus (m)',
      'Net Adjustment (m)',
      'Raw Elapsed (s)',
      'Adjusted Time (s)',
      'Formatted Adjusted Time',
    ];
    const rows = rankings.map((r) => [
      r.rank,
      `"${r.teamName.replace(/"/g, '""')}"`,
      r.finished ? 'Finished' : 'In Field',
      r.completedStages ?? 0,
      r.totalSteps ?? 11,
      `"${(r.currentStageTitle || `Stage ${r.currentLevel}`).replace(/"/g, '""')}"`,
      r.hintsUsedCount ?? 0,
      r.hintPenaltyMins ?? 0,
      r.zonePenaltyMins ?? 0,
      r.adminPenaltyMins ?? 0,
      r.bonusMins ?? 0,
      r.netAdjustmentMins ?? 0,
      r.rawElapsedSecs != null ? r.rawElapsedSecs.toFixed(1) : '',
      r.adjustedTimeSecs != null ? r.adjustedTimeSecs.toFixed(1) : '',
      formatDurationSecs(r.adjustedTimeSecs),
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

  const finishedTeams = useMemo(() => rankings.filter((r) => r.finished), [rankings]);
  const podium = finishedTeams.slice(0, 3);
  const activeCount = rankings.filter((r) => !r.finished && r.currentLevel > 0).length;
  const fastestSecs = podium[0]?.adjustedTimeSecs ?? null;

  const filteredRankings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rankings.filter((r) => {
      if (q && !r.teamName.toLowerCase().includes(q) && !r.currentStageTitle.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'finished') return r.finished;
      if (statusFilter === 'active') return !r.finished;
      return true;
    });
  }, [rankings, search, statusFilter]);

  const selectedRanking = useMemo(
    () => (selectedTeamId != null ? rankings.find((r) => r.teamId === selectedTeamId) ?? null : null),
    [rankings, selectedTeamId],
  );

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* Top Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Standings & Podium Telemetry</h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Click any squad row or podium card for stage-by-stage splits, GPS arrivals, and penalty audit logs.
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
            <span>Export Detailed CSV</span>
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

      {/* Executive Telemetry KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Registered Squads</span>
          <span className="text-2xl font-bold text-white tabular-nums mt-1 block">{rankings.length}</span>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Racing In Field</span>
          <span className="text-2xl font-bold text-cyan-300 tabular-nums mt-1 block">{activeCount}</span>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Verified Finished</span>
          <span className="text-2xl font-bold text-emerald-400 tabular-nums mt-1 block">{finishedTeams.length}</span>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Winning Pace</span>
          <span className="text-2xl font-bold text-amber-300 tabular-nums mt-1 block">
            {formatDurationSecs(fastestSecs)}
          </span>
        </div>
      </div>

      {/* Podium Cards */}
      {podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {podium[0] && (
            <button
              type="button"
              onClick={() => setSelectedTeamId(podium[0].teamId)}
              className="text-left bg-gradient-to-b from-amber-500/[0.08] to-zinc-900/80 border border-amber-500/40 hover:border-amber-400/70 rounded-2xl p-5 flex flex-col justify-between order-1 md:order-2 shadow-xl shadow-amber-950/20 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between mb-3 w-full">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-mono font-bold text-xs">
                  #1
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 uppercase font-bold tracking-wider">
                  1st Place • Champion
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">{podium[0].teamName}</h3>
                <p className="text-xs font-mono text-zinc-300 mt-1">
                  Adjusted: <strong className="text-amber-300 font-bold">{formatDurationSecs(podium[0].adjustedTimeSecs)}</strong>
                </p>
                <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  Base {formatDurationSecs(podium[0].rawElapsedSecs)} • Net {podium[0].netAdjustmentMins >= 0 ? `+${podium[0].netAdjustmentMins}m` : `${podium[0].netAdjustmentMins}m`}
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 mt-4 pt-2.5 border-t border-amber-500/20 flex items-center justify-between w-full font-bold">
                <span>Verified Finish ({podium[0].completedStages}/{podium[0].totalSteps})</span>
                <span className="text-amber-300">Inspect →</span>
              </span>
            </button>
          )}

          {podium[1] && (
            <button
              type="button"
              onClick={() => setSelectedTeamId(podium[1].teamId)}
              className="text-left bg-gradient-to-b from-zinc-400/[0.05] to-zinc-900/60 border border-zinc-700/80 hover:border-zinc-500 rounded-2xl p-5 flex flex-col justify-between order-2 md:order-1 shadow-lg transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between mb-3 w-full">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-mono font-bold text-xs">
                  #2
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase font-semibold">
                  2nd Place • Runner-Up
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">{podium[1].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-1">
                  Adjusted: <strong className="text-zinc-200">{formatDurationSecs(podium[1].adjustedTimeSecs)}</strong>
                </p>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  Base {formatDurationSecs(podium[1].rawElapsedSecs)} • Net {podium[1].netAdjustmentMins >= 0 ? `+${podium[1].netAdjustmentMins}m` : `${podium[1].netAdjustmentMins}m`}
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-4 pt-2.5 border-t border-zinc-800 flex items-center justify-between w-full">
                <span>Verified Finish</span>
                <span className="text-cyan-300">Inspect →</span>
              </span>
            </button>
          )}

          {podium[2] && (
            <button
              type="button"
              onClick={() => setSelectedTeamId(podium[2].teamId)}
              className="text-left bg-gradient-to-b from-amber-700/[0.05] to-zinc-900/60 border border-amber-800/40 hover:border-amber-600/70 rounded-2xl p-5 flex flex-col justify-between order-3 shadow-lg transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between mb-3 w-full">
                <div className="w-8 h-8 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
                  #3
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-amber-800/40 uppercase font-semibold">
                  3rd Place • Bronze
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">{podium[2].teamName}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-1">
                  Adjusted: <strong className="text-zinc-200">{formatDurationSecs(podium[2].adjustedTimeSecs)}</strong>
                </p>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  Base {formatDurationSecs(podium[2].rawElapsedSecs)} • Net {podium[2].netAdjustmentMins >= 0 ? `+${podium[2].netAdjustmentMins}m` : `${podium[2].netAdjustmentMins}m`}
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 mt-4 pt-2.5 border-t border-zinc-800 flex items-center justify-between w-full">
                <span>Verified Finish</span>
                <span className="text-cyan-300">Inspect →</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col gap-3 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
          <div>
            <h3 className="text-xs font-semibold text-zinc-100">Official Event Standings</h3>
            <span className="text-[11px] font-mono text-zinc-500">
              Showing {filteredRankings.length} of {rankings.length} squads • Tap any row to inspect dossier
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search squad or stage…"
              className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-400 w-44"
            />
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[10px] font-mono">
              {(['all', 'finished', 'active'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
                    statusFilter === tab ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && rankings.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs animate-pulse">
            COMPUTING LIVE STANDINGS…
          </div>
        ) : filteredRankings.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">
            NO SQUADS MATCH CURRENT FILTERS.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Squad</th>
                  <th className="py-2.5 px-3">Progress & Landmark</th>
                  <th className="py-2.5 px-3 text-right">Net Penalties</th>
                  <th className="py-2.5 px-3 text-right">Base Elapsed</th>
                  <th className="py-2.5 px-3 text-right">Adjusted Time</th>
                  <th className="py-2.5 px-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredRankings.map((team) => {
                  const pct = team.totalSteps > 0
                    ? Math.min(100, Math.round((team.completedStages / team.totalSteps) * 100))
                    : 0;
                  const netMins = team.netAdjustmentMins ?? 0;

                  return (
                    <tr
                      key={team.teamId}
                      onClick={() => setSelectedTeamId(team.teamId)}
                      className="hover:bg-zinc-800/45 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3 font-bold">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs tabular-nums ${
                            team.rank === 1 && team.finished
                              ? 'bg-amber-500/20 text-amber-300 font-black border border-amber-500/30'
                              : team.rank === 2 && team.finished
                              ? 'bg-zinc-700/50 text-zinc-200 border border-zinc-600'
                              : team.rank === 3 && team.finished
                              ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40'
                              : 'text-zinc-400 bg-zinc-950 border border-zinc-800'
                          }`}
                        >
                          #{team.rank}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-sans font-bold text-white text-sm tracking-tight group-hover:text-cyan-300 transition-colors">
                            {team.teamName}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                team.finished
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : team.currentLevel > 0
                                  ? 'bg-cyan-500/15 text-cyan-300'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {team.finished ? 'Verified Finish' : team.currentLevel > 0 ? 'In Field' : 'Standby'}
                            </span>
                            {team.latestPhotoStatus && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold ${
                                  team.latestPhotoStatus === 'approved'
                                    ? 'text-emerald-400 bg-emerald-950/60'
                                    : team.latestPhotoStatus === 'rejected'
                                    ? 'text-rose-400 bg-rose-950/60'
                                    : 'text-amber-300 bg-amber-950/60'
                                }`}
                              >
                                Photo {team.latestPhotoStatus}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 min-w-[200px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-200 truncate max-w-[160px] font-sans font-medium">
                              {team.currentStageTitle}
                            </span>
                            <span className="text-zinc-400 tabular-nums">
                              {team.completedStages}/{team.totalSteps}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
                            <div
                              className={`h-full ${team.finished ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums">
                        {netMins > 0 ? (
                          <span className="text-rose-400 font-bold">+{netMins}m</span>
                        ) : netMins < 0 ? (
                          <span className="text-emerald-400 font-bold">{netMins}m</span>
                        ) : (
                          <span className="text-zinc-600">0m</span>
                        )}
                        {(team.hintsUsedCount > 0 || team.zonePenaltyMins > 0) && (
                          <span className="block text-[9px] text-zinc-500">
                            {team.hintsUsedCount}h / +{team.zonePenaltyMins}m zone
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right text-zinc-400 tabular-nums">
                        {team.finished ? formatDurationSecs(team.rawElapsedSecs) : '—'}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-white tabular-nums">
                        {team.finished ? formatDurationSecs(team.adjustedTimeSecs) : 'Racing'}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span className="text-[10px] text-cyan-400 group-hover:text-cyan-300 font-bold">
                          Inspect →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed On-Click Squad Breakdown Modal */}
      <SquadBreakdownModal
        ranking={selectedRanking}
        onClose={() => setSelectedTeamId(null)}
      />
    </div>
  );
}
