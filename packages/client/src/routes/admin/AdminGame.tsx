import { useEffect, useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminGame() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [pendingPhotosCount, setPendingPhotosCount] = useState<number>(0);
  const [occupancyMatrix, setOccupancyMatrix] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingTeamId, setActionLoadingTeamId] = useState<number | null>(null);

  // Live Activity Log
  const [activityLogs, setActivityLogs] = useState<
    { id: string; timestamp: string; message: string; type: 'info' | 'warn' | 'success' | 'alert' }[]
  >([]);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'finished' | 'final' | 'sos'>('all');

  // Broadcast Console state
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | number>('all');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Modals state
  const [nudgeTeam, setNudgeTeam] = useState<any | null>(null);
  const [nudgeText, setNudgeText] = useState('');
  const [penaltyTeam, setPenaltyTeam] = useState<any | null>(null);
  const [penaltyMinutes, setPenaltyMinutes] = useState<number>(5);
  const [penaltyReason, setPenaltyReason] = useState('Rule violation');

  // Live Timer
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function addLog(message: string, type: 'info' | 'warn' | 'success' | 'alert' = 'info') {
    const log = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setActivityLogs((prev) => [log, ...prev.slice(0, 49)]);
  }

  useEffect(() => {
    reload();
    const socket = getSocket();

    socket.on('game:status_changed', (data: any) => {
      setGame((g: any) => (g ? { ...g, ...data } : g));
      addLog(`Event status changed to: ${data.status.toUpperCase()}`, 'info');
      reload();
    });

    socket.on('sos:received', (alert: any) => {
      setSos((prev) => [alert, ...prev.filter((s) => s.id !== alert.id)]);
      addLog(`🚨 EMERGENCY SOS from ${alert.teamName ?? 'Team'}`, 'alert');
    });

    socket.on('sos:resolved', ({ id }: { id: number }) => {
      setSos((prev) => prev.filter((s) => s.id !== id));
      addLog(`✓ SOS Alert #${id} resolved`, 'info');
    });

    socket.on('admin:photo_submitted', (data: any) => {
      setPendingPhotosCount((c) => c + 1);
      addLog(`📸 New verification photo submitted by ${data?.teamName ?? 'Team'}`, 'info');
    });

    socket.on('admin:occupancy_update', (matrix: any[]) => {
      setOccupancyMatrix(matrix);
    });

    socket.on('team:checkpoint_reached', (data: any) => {
      addLog(`📍 ${data.teamName} reached GPS target for ${data.levelTitle}`, 'success');
      reload();
    });

    socket.on('level:unlocked', () => {
      reload();
    });

    socket.on('winner:declared', (data: any) => {
      addLog(`🏆 WINNER: ${data.teamName} completed the hunt!`, 'success');
      reload();
    });

    return () => {
      socket.off('game:status_changed');
      socket.off('sos:received');
      socket.off('sos:resolved');
      socket.off('admin:photo_submitted');
      socket.off('team:checkpoint_reached');
      socket.off('level:unlocked');
      socket.off('winner:declared');
    };
  }, []);

  async function reload() {
    try {
      const [games, teamsData, sosData, photosData] = await Promise.all([
        api.getGames(),
        api.getAdminTeams(),
        api.getSosAlerts(),
        api.getAdminPhotos().catch(() => []),
      ]);

      const activeGame = games[0] ?? null;
      setGame(activeGame);
      setTeams(teamsData);
      setSos(sosData);
      setPendingPhotosCount(photosData.filter((p: any) => p.status === 'pending').length);

      if (activeGame) {
        const lvlData = await api.getLevels(activeGame.id);
        setLevels(lvlData.sort((a, b) => a.orderIndex - b.orderIndex));
        const occData = await api.getOccupancyMatrix(activeGame.id).catch(() => []);
        setOccupancyMatrix(occData);
      }
    } catch (err) {
      console.error('Error reloading command desk state:', err);
    }
  }

  async function handleGameAction(action: string) {
    if (!game) return;
    if (action === 'end' && !confirm('Are you sure you want to officially END the hunt for all teams?')) {
      return;
    }
    if (action === 'reset' && !confirm('Reset all teams and timers to initial idle state?')) {
      return;
    }

    setLoading(true);
    try {
      await api.patchGameStatus(game.id, action);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Game action failed');
    } finally {
      setLoading(false);
    }
  }

  const elapsedFormatted = useMemo(() => {
    if (!game?.startedAt) return '00:00:00';
    const start = new Date(game.startedAt).getTime();
    const end = game.endedAt
      ? new Date(game.endedAt).getTime()
      : game.pausedAt
      ? new Date(game.pausedAt).getTime()
      : now;
    const diff = Math.max(0, Math.floor((end - start - (game.totalPausedMs || 0)) / 1000));
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [game, now]);

  async function handleTransmitBroadcast(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!game || !broadcastMsg.trim()) return;

    setIsBroadcasting(true);
    try {
      const isTargeted = broadcastTarget !== 'all';
      await api.sendAnnouncement(
        game.id,
        broadcastMsg.trim(),
        isTargeted ? 'nudge' : 'broadcast',
        isTargeted ? Number(broadcastTarget) : undefined,
      );
      addLog(`Broadcast sent: "${broadcastMsg.trim()}"`, 'info');
      setBroadcastMsg('');
    } catch (err: any) {
      alert(err.message ?? 'Transmission failed');
    } finally {
      setIsBroadcasting(false);
    }
  }

  async function handleResolveSos(sosId: number, teamName: string) {
    try {
      await api.resolveSos(sosId);
      setSos((prev) => prev.filter((s) => s.id !== sosId));
    } catch (err: any) {
      alert(err.message ?? 'Failed to resolve alert');
    }
  }

  async function handleVerifyFinish(teamId: number, teamName: string) {
    if (
      !confirm(
        `Confirm podium finish verification for "${teamName}" at Start Venue?`,
      )
    ) {
      return;
    }

    setActionLoadingTeamId(teamId);
    try {
      await api.verifyTeamFinish(teamId);
      await reload();
      addLog(`Podium finish verified for ${teamName}`, 'success');
    } catch (err: any) {
      alert(err.message ?? 'Verification failed');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  async function handleForceUnlock(teamId: number, teamName: string) {
    if (!confirm(`Emergency override: Force unlock next clue for "${teamName}"?`)) return;
    setActionLoadingTeamId(teamId);
    try {
      await api.forceUnlockLevel(teamId);
      await reload();
      addLog(`Force unlocked next level for ${teamName}`, 'warn');
    } catch (err: any) {
      alert(err.message ?? 'Could not unlock level');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  async function handleForceComplete(teamId: number, teamName: string) {
    if (!confirm(`Force complete current level for "${teamName}" and advance?`)) return;
    setActionLoadingTeamId(teamId);
    try {
      await api.forceCompleteLevel(teamId);
      await reload();
      addLog(`Force completed current level for ${teamName}`, 'warn');
    } catch (err: any) {
      alert(err.message ?? 'Could not complete level');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  async function handleApplyPenalty(e: React.FormEvent) {
    e.preventDefault();
    if (!penaltyTeam) return;

    try {
      await api.adjustTeamPenalty(
        penaltyTeam.id,
        penaltyMinutes,
        `${penaltyReason} (by Admin)`,
      );
      addLog(`Adjusted time (${penaltyMinutes > 0 ? '+' : ''}${penaltyMinutes}m) for ${penaltyTeam.name}`, 'warn');
      setPenaltyTeam(null);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to apply adjustment');
    }
  }

  async function handleSendNudge() {
    if (!game || !nudgeTeam || !nudgeText.trim()) return;
    try {
      await api.sendAnnouncement(game.id, nudgeText.trim(), 'nudge', nudgeTeam.id);
      addLog(`Nudge sent to ${nudgeTeam.name}: "${nudgeText.trim()}"`, 'info');
      setNudgeTeam(null);
      setNudgeText('');
    } catch (err: any) {
      alert(err.message ?? 'Failed to transmit nudge');
    }
  }

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      const isFinished = Boolean(t.finishedAt);
      const currentLevelOrder = t.levelProgress?.[0]?.level?.orderIndex ?? 1;
      const isFinalLevel = levels.length > 0 && currentLevelOrder >= levels.length;
      const hasSos = sos.some((s) => s.teamId === t.id);

      if (filter === 'active') return !isFinished;
      if (filter === 'finished') return isFinished;
      if (filter === 'final') return !isFinished && isFinalLevel;
      if (filter === 'sos') return hasSos;
      return true;
    });
  }, [teams, search, filter, levels, sos]);

  const stats = useMemo(() => {
    const total = teams.length;
    const finished = teams.filter((t) => t.finishedAt).length;
    const active = total - finished;
    const atFinale = teams.filter(
      (t) => !t.finishedAt && levels.length > 0 && (t.levelProgress?.[0]?.level?.orderIndex ?? 1) >= levels.length,
    ).length;

    return { total, finished, active, atFinale };
  }, [teams, levels]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* 1. TOP MISSION BANNER */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-white">{game?.name ?? 'SDMCET Campus Hunt'}</h2>
            {game && (
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold uppercase tracking-wide border ${
                  game.status === 'running'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : game.status === 'paused'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : game.status === 'ended'
                    ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {game.status}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            OPERATIONAL COMMAND • GEOFENCING ACTIVE • SDMCET CAMPUS
          </p>
        </div>

        {/* Master Clock & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800/80 flex items-center gap-3">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Elapsed</span>
            <span className="text-xl font-mono font-bold text-zinc-100 tabular-nums">
              {elapsedFormatted}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {game?.status === 'idle' && (
              <button
                onClick={() => handleGameAction('start')}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px]"
              >
                Start Event
              </button>
            )}

            {game?.status === 'running' && (
              <button
                onClick={() => handleGameAction('pause')}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700 transition-all min-h-[38px]"
              >
                Pause Timers
              </button>
            )}

            {game?.status === 'paused' && (
              <button
                onClick={() => handleGameAction('resume')}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px]"
              >
                Resume Timers
              </button>
            )}

            {(game?.status === 'running' || game?.status === 'paused') && (
              <button
                onClick={() => handleGameAction('end')}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-medium text-xs border border-rose-800/50 transition-all min-h-[38px]"
              >
                End Event
              </button>
            )}

            {game?.status === 'ended' && (
              <button
                onClick={() => handleGameAction('start')}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px]"
              >
                Relaunch
              </button>
            )}

            <button
              onClick={() => handleGameAction('reset')}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono border border-zinc-800 transition-all min-h-[38px]"
              title="Reset game state"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* 2. OPERATIONAL KPI METRIC TILES */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Teams Enrolled</span>
          <span className="text-2xl font-bold text-zinc-100 font-mono mt-1 tabular-nums">{stats.total}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-emerald-400 uppercase">In Field</span>
          <span className="text-2xl font-bold text-emerald-400 font-mono mt-1 tabular-nums">{stats.active}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-300 uppercase">At Finale</span>
          <span className="text-2xl font-bold text-zinc-200 font-mono mt-1 tabular-nums">{stats.atFinale}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Verified Finished</span>
          <span className="text-2xl font-bold text-zinc-200 font-mono mt-1 tabular-nums">{stats.finished}</span>
        </div>

        <div
          onClick={() => setFilter(sos.length > 0 ? 'sos' : 'all')}
          className={`cursor-pointer rounded-xl p-3.5 flex flex-col justify-between transition-all ${
            sos.length > 0
              ? 'bg-rose-950/60 border border-rose-500/70 text-rose-300'
              : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400'
          }`}
        >
          <span className="text-[10px] font-mono uppercase">Emergency SOS</span>
          <span className={`text-2xl font-bold font-mono mt-1 tabular-nums ${sos.length > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
            {sos.length}
          </span>
        </div>

        <NavLink
          to="/admin/photos"
          className={`rounded-xl p-3.5 flex flex-col justify-between transition-all ${
            pendingPhotosCount > 0
              ? 'bg-amber-950/40 border border-amber-500/60 text-amber-300'
              : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400'
          }`}
        >
          <span className="text-[10px] font-mono uppercase">Photos to Review</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-bold font-mono tabular-nums ${pendingPhotosCount > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>
              {pendingPhotosCount}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 underline">queue →</span>
          </div>
        </NavLink>
      </div>

      {/* 2.5. CONFLICT-FREE LANDMARK OCCUPANCY MATRIX */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white flex items-center gap-2">
                <span>🛡️</span>
                <span>Conflict-Free Campus Landmark Monitor</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                0 COLLISIONS
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Real-time station occupancy: No two teams are ever routed to the same landmark simultaneously.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
              Total Stations: <strong className="text-white">{occupancyMatrix.length}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
              Free: <strong className="text-emerald-400">{occupancyMatrix.filter((m) => !m.isOccupied).length}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300">
              Occupied: <strong className="text-amber-400">{occupancyMatrix.filter((m) => m.isOccupied).length}</strong>
            </span>
          </div>
        </div>

        {/* Occupancy Station Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
          {occupancyMatrix.map((station) => {
            const isOccupied = station.isOccupied;
            const occupant = station.activeOccupants?.[0];

            return (
              <div
                key={station.levelId}
                className={`p-3 rounded-xl border text-xs font-mono transition-all flex flex-col justify-between gap-2 ${
                  station.isFinal
                    ? 'bg-purple-950/20 border-purple-500/40 text-purple-200'
                    : isOccupied
                    ? 'bg-amber-950/20 border-amber-500/40 text-amber-200 shadow-sm'
                    : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[10px] text-zinc-500 shrink-0">#{station.orderIndex}</span>
                    <span className="font-bold text-white truncate text-[11px]">{station.title}</span>
                  </div>
                  {station.isFinal && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold shrink-0">
                      FINALE
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                  {isOccupied && occupant ? (
                    <div className="flex items-center gap-1.5 text-amber-300 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span className="font-bold truncate">{occupant.teamName}</span>
                      <span className="text-[9px] text-zinc-400 shrink-0">(Step {occupant.stepNumber}/10)</span>
                    </div>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Available</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. EMERGENCY SOS FEED */}
      {sos.length > 0 && (
        <div className="bg-rose-950/30 border border-rose-500/40 rounded-2xl p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wide">
              Active SOS Distress Calls ({sos.length})
            </span>
            <span className="text-[10px] font-mono text-zinc-400">Dispatch assistance immediately</span>
          </div>

          <div className="space-y-2">
            {sos.map((alert) => (
              <div
                key={alert.id}
                className="bg-zinc-950/80 rounded-xl p-3 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-bold text-white">{alert.team?.name ?? 'Unknown Team'}</span>
                  <span className="text-zinc-400 font-mono ml-3">
                    GPS: {alert.lat?.toFixed(5)}, {alert.lng?.toFixed(5)} • {new Date(alert.sentAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-[11px] font-mono"
                  >
                    Maps 📍
                  </a>
                  <button
                    onClick={() => handleResolveSos(alert.id, alert.team?.name)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-[11px]"
                  >
                    ✓ Acknowledge & Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. TACTICAL RADIO TRANSMITTER */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">Broadcast Console</span>
          <span className="text-[10px] font-mono text-zinc-500">Transmits instant HUD alert to team phones</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            'Hunt is officially underway! Proceed to Objective 1.',
            '15-Minute Warning: Clue window closing soon.',
            'Target operative spotted near Amphitheatre grounds.',
            'Hold position: Timers paused by Event Control.',
            'All teams report to Start Venue for podium finish verification.',
          ].map((preset) => (
            <button
              key={preset}
              onClick={() => setBroadcastMsg(preset)}
              className="text-[11px] font-mono bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md border border-zinc-800/80 transition-all truncate max-w-xs"
            >
              {preset}
            </button>
          ))}
        </div>

        <form onSubmit={handleTransmitBroadcast} className="flex flex-col sm:flex-row gap-2">
          <select
            value={broadcastTarget}
            onChange={(e) => setBroadcastTarget(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500"
          >
            <option value="all">📢 ALL TEAMS</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                🔒 {t.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Type announcement message…"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500"
          />

          <button
            type="submit"
            disabled={isBroadcasting || !broadcastMsg.trim()}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px] flex items-center justify-center gap-1"
          >
            {isBroadcasting ? 'Sending…' : 'Transmit'}
          </button>
        </form>
      </div>

      {/* 5. TEAM PROGRESS MATRIX & LIVE LOG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Teams List (8 columns) */}
        <div className="lg:col-span-8 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
            <div>
              <span className="text-xs font-semibold text-zinc-100">
                Team Operations ({filteredTeams.length} of {teams.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
                className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-600 w-40"
              />

              <button
                onClick={reload}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono"
              >
                ↻
              </button>

              <NavLink
                to="/admin/teams"
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700"
              >
                + Add Team
              </NavLink>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono">
            {[
              { id: 'all', label: `All (${teams.length})` },
              { id: 'active', label: `In Field (${stats.active})` },
              { id: 'final', label: `Finale (${stats.atFinale})` },
              { id: 'finished', label: `Finished (${stats.finished})` },
              { id: 'sos', label: `SOS (${sos.length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filter === f.id
                    ? 'bg-zinc-100 text-zinc-950 font-bold'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Team Cards */}
          <div className="space-y-2 mt-1">
            {filteredTeams.map((team) => {
              const currentLevelOrder = team.levelProgress?.[0]?.level?.orderIndex ?? 1;
              const isFinished = Boolean(team.finishedAt);
              const isLoadingThis = actionLoadingTeamId === team.id;
              const hasSos = sos.some((s) => s.teamId === team.id);
              const activeProgress = team.levelProgress?.[0];
              const reachedLocation = Boolean(activeProgress?.locationReachedAt);
              const penaltyMinutesTotal = team.penalties?.reduce((acc: number, p: any) => acc + (p.minutes || 0), 0) ?? 0;

              return (
                <div
                  key={team.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    hasSos
                      ? 'bg-rose-950/20 border-rose-500/50'
                      : isFinished
                      ? 'bg-emerald-950/15 border-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80'
                  }`}
                >
                  <div className="flex flex-col gap-1.5 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{team.name}</span>
                      {isFinished ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          FINISHED
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-400">
                          Stage {currentLevelOrder} {reachedLocation ? '(GPS ✓)' : ''}
                        </span>
                      )}
                    </div>

                    {/* Progress indicators */}
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      {levels.map((lvl) => {
                        const isDone = currentLevelOrder > lvl.orderIndex || isFinished;
                        const isCurrent = currentLevelOrder === lvl.orderIndex && !isFinished;
                        return (
                          <span
                            key={lvl.id}
                            className={`px-1.5 py-0.5 rounded ${
                              isDone
                                ? 'bg-zinc-800 text-zinc-300'
                                : isCurrent
                                ? 'bg-zinc-100 text-zinc-950 font-bold'
                                : 'text-zinc-600'
                            }`}
                          >
                            L{lvl.orderIndex}
                          </span>
                        );
                      })}

                      {penaltyMinutesTotal !== 0 && (
                        <span className={`ml-2 ${penaltyMinutesTotal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {penaltyMinutesTotal > 0 ? `+${penaltyMinutesTotal}` : penaltyMinutesTotal}m
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!isFinished ? (
                      <>
                        <button
                          onClick={() => handleVerifyFinish(team.id, team.name)}
                          disabled={isLoadingThis}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all"
                        >
                          {isLoadingThis ? 'Verifying…' : 'Verify Finish'}
                        </button>

                        <button
                          onClick={() => handleForceUnlock(team.id, team.name)}
                          disabled={isLoadingThis}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px] border border-zinc-700"
                          title="Failsafe: Unlock next clue"
                        >
                          Unlock ➔
                        </button>

                        <button
                          onClick={() => {
                            setPenaltyTeam(team);
                            setPenaltyMinutes(5);
                            setPenaltyReason('Time adjustment');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px] border border-zinc-700"
                        >
                          +/- Time
                        </button>

                        <button
                          onClick={() => {
                            setNudgeTeam(team);
                            setNudgeText('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px] border border-zinc-700"
                        >
                          Nudge
                        </button>
                      </>
                    ) : (
                      <span className="text-zinc-500 font-mono text-xs">
                        Finished {new Date(team.finishedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Live Event Activity Log (4 columns) */}
        <div className="lg:col-span-4 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-100">Live Activity Feed</span>
            <span className="text-[10px] font-mono text-zinc-500">Real-time Stream</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[460px] pr-1 font-mono text-[11px]">
            {activityLogs.length === 0 ? (
              <p className="text-zinc-600 text-xs py-8 text-center">Activity milestones will stream here live…</p>
            ) : (
              activityLogs.map((log) => (
                <div key={log.id} className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-500">{log.timestamp}</span>
                  <span className="text-zinc-300 leading-snug">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* TIME ADJUSTMENT MODAL */}
      {penaltyTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <h3 className="font-semibold text-white text-sm">Time Adjustment: {penaltyTeam.name}</h3>
            <p className="text-xs text-zinc-400 font-mono">Add penalty or grant bonus time to official score.</p>

            <form onSubmit={handleApplyPenalty} className="space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Minutes (+ for penalty, - for bonus)</label>
                <input
                  type="number"
                  value={penaltyMinutes}
                  onChange={(e) => setPenaltyMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  placeholder="e.g. Restricted yard entry"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPenaltyTeam(null)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NUDGE MODAL */}
      {nudgeTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <h3 className="font-semibold text-white text-sm">Nudge {nudgeTeam.name}</h3>
            <p className="text-xs text-zinc-400 font-mono">Send a subtle direction cue to their screen:</p>

            <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
              {[
                'Getting warmer!',
                'Getting colder…',
                'Target nearby!',
                'Check library lawn',
              ].map((msg) => (
                <button
                  key={msg}
                  type="button"
                  onClick={() => setNudgeText(msg)}
                  className={`p-2 rounded-lg border text-left text-[11px] transition-all ${
                    nudgeText === msg
                      ? 'border-zinc-400 bg-zinc-800 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {msg}
                </button>
              ))}
            </div>

            <input
              value={nudgeText}
              onChange={(e) => setNudgeText(e.target.value)}
              placeholder="Or write custom cue…"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-zinc-500"
            />

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setNudgeTeam(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNudge}
                disabled={!nudgeText.trim()}
                className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold"
              >
                Send Nudge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
