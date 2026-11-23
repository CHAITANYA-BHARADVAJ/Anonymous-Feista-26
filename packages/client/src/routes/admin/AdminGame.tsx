import { useEffect, useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminGame() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [pendingPhotosCount, setPendingPhotosCount] = useState<number>(0);
  const [occupancyMatrix, setOccupancyMatrix] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'end' | 'reset' | null>(null);
  const [actionLoadingTeamId, setActionLoadingTeamId] = useState<number | null>(null);

  // Live Activity Log
  const [activityLogs, setActivityLogs] = useState<
    { id: string; timestamp: string; message: string; type: 'info' | 'warn' | 'success' | 'alert' }[]
  >([]);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'finished' | 'final'>('all');

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

  // Emergency Level Override & Stage Jump state
  const [jumpTeam, setJumpTeam] = useState<any | null>(null);
  const [targetJumpStep, setTargetJumpStep] = useState<number>(1);
  const [confirmTeamAction, setConfirmTeamAction] = useState<{ type: 'advance' | 'finish'; team: any } | null>(null);

  // Team Access Code Reset & Copy state
  const [resetCodeTeam, setResetCodeTeam] = useState<any | null>(null);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [isResettingCode, setIsResettingCode] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState<number | null>(null);

  function handleCopyCode(teamId: number, code: string) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedTeamId(teamId);
    setTimeout(() => setCopiedTeamId(null), 2000);
  }

  function generateResetCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewCodeInput(code);
  }

  async function handleSaveNewCode(e: React.FormEvent) {
    e.preventDefault();
    if (!resetCodeTeam || !newCodeInput.trim()) return;

    setIsResettingCode(true);
    try {
      const res = await api.resetTeamAccessCode(resetCodeTeam.id, newCodeInput.trim());
      addLog(`🔑 Access code updated for ${resetCodeTeam.name} to "${res.displayCode}"`, 'warn');
      setResetCodeTeam(null);
      setNewCodeInput('');
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to update access code');
    } finally {
      setIsResettingCode(false);
    }
  }

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

    const handleStatus = (data: any) => {
      const statusData = data.game || data;
      setGame((g: any) => (g ? { ...g, ...statusData } : statusData));
      addLog(`Event status changed to: ${(statusData.status || '').toUpperCase()}`, 'info');
      reload();
    };

    socket.on('game:status_changed', handleStatus);
    socket.on('game:status', handleStatus);

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
      socket.off('game:status_changed', handleStatus);
      socket.off('game:status', handleStatus);
      socket.off('admin:photo_submitted');
      socket.off('team:checkpoint_reached');
      socket.off('level:unlocked');
      socket.off('winner:declared');
    };
  }, []);

  async function reload() {
    try {
      const [games, teamsData, photosData] = await Promise.all([
        api.getGames().catch(() => []),
        api.getAdminTeams().catch(() => []),
        api.getAdminPhotos().catch(() => []),
      ]);

      const activeGame = games?.[0] ?? null;
      if (activeGame) {
        setGame(activeGame);
      }
      setTeams(teamsData || []);
      setPendingPhotosCount((photosData || []).filter((p: any) => p.status === 'pending').length);

      if (activeGame) {
        const lvlData = await api.getLevels(activeGame.id).catch(() => []);
        setLevels((lvlData || []).sort((a: any, b: any) => a.orderIndex - b.orderIndex));
        const occData = await api.getOccupancyMatrix(activeGame.id).catch(() => []);
        setOccupancyMatrix(occData || []);
      }
    } catch (err) {
      console.error('Error reloading command desk state:', err);
    }
  }

  async function executeGameAction(action: string) {
    setActionRunning(action);
    setConfirmAction(null);
    try {
      addLog(`Transmitting game directive: ${action.toUpperCase()}...`, 'info');
      const updated: any = await api.patchGameStatus(game?.id, action);
      if (updated) {
        setGame((g: any) => ({ ...(g || {}), ...updated }));
        addLog(`Directive applied successfully: ${(updated.status || action).toUpperCase()}`, 'success');
      }
      await reload();
    } catch (err: any) {
      console.error('Game action failed:', err);
      addLog(`Action failed (${action}): ${err.message}`, 'alert');
      alert(`Game Action Failed: ${err.message ?? 'Unknown error'}`);
    } finally {
      setActionRunning(null);
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

  async function handleVerifyFinish(teamId: number, teamName: string) {
    setActionLoadingTeamId(teamId);
    try {
      await api.verifyTeamFinish(teamId);
      await reload();
      addLog(`Podium finish verified for ${teamName}`, 'success');
    } catch (err: any) {
      alert(err.message ?? 'Verification failed');
    } finally {
      setActionLoadingTeamId(null);
      setConfirmTeamAction(null);
    }
  }

  async function handleBypassGps(teamId: number, teamName: string) {
    setActionLoadingTeamId(teamId);
    try {
      const res = await api.bypassTeamGps(teamId);
      addLog(`🔓 GPS bypassed for ${teamName}: ${res.levelTitle ?? 'Clue'} decrypted!`, 'success');
      await reload();
    } catch (err: any) {
      console.error('Bypass GPS failed:', err);
      alert(err.message ?? 'Could not bypass GPS check');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  async function handleForceAdvance(teamId: number, teamName: string) {
    setActionLoadingTeamId(teamId);
    try {
      const res = await api.forceAdvanceTeam(teamId);
      addLog(`⏩ Force advanced ${teamName} to Stage ${res.nextStepNumber ?? 'Next'}`, 'warn');
      await reload();
    } catch (err: any) {
      console.error('Force advance failed:', err);
      alert(err.message ?? 'Could not advance level');
    } finally {
      setActionLoadingTeamId(null);
      setConfirmTeamAction(null);
    }
  }

  async function handleExecuteJumpStage() {
    if (!jumpTeam) return;
    setActionLoadingTeamId(jumpTeam.id);
    try {
      await api.jumpTeamStage(jumpTeam.id, targetJumpStep);
      addLog(`🔀 Emergency override: moved ${jumpTeam.name} directly to Stage ${targetJumpStep}`, 'warn');
      setJumpTeam(null);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to jump squad stage');
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

      if (filter === 'active') return !isFinished;
      if (filter === 'finished') return isFinished;
      if (filter === 'final') return !isFinished && isFinalLevel;
      return true;
    });
  }, [teams, search, filter, levels]);

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
            <span className="text-[9px] font-mono text-zinc-500 border-l border-zinc-800 pl-2.5">
              Target: 60m
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {game?.status === 'idle' && (
              <button
                onClick={() => executeGameAction('start')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px] flex items-center gap-1.5 shadow-md shadow-white/5"
              >
                {actionRunning === 'start' ? 'Starting…' : 'Start Event'}
              </button>
            )}

            {game?.status === 'running' && (
              <button
                onClick={() => executeGameAction('pause')}
                disabled={Boolean(actionRunning)}
                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs border border-amber-500/50 transition-all min-h-[38px] flex items-center gap-1.5 shadow-lg shadow-amber-950/40"
              >
                <span>⏸</span>
                <span>{actionRunning === 'pause' ? 'Pausing…' : 'Pause Timers'}</span>
              </button>
            )}

            {game?.status === 'paused' && (
              <button
                onClick={() => executeGameAction('resume')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all min-h-[38px] flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
              >
                <span>▶</span>
                <span>{actionRunning === 'resume' ? 'Resuming…' : 'Resume Timers'}</span>
              </button>
            )}

            {(game?.status === 'running' || game?.status === 'paused') && (
              <button
                onClick={() => setConfirmAction('end')}
                disabled={Boolean(actionRunning)}
                className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-bold text-xs border border-rose-700/60 transition-all min-h-[38px] flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                <span>⏹</span>
                <span>{actionRunning === 'end' ? 'Ending…' : 'End Event'}</span>
              </button>
            )}

            {game?.status === 'ended' && (
              <button
                onClick={() => executeGameAction('start')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all min-h-[38px] flex items-center gap-1.5"
              >
                {actionRunning === 'start' ? 'Launching…' : 'Relaunch'}
              </button>
            )}

            <button
              onClick={() => setConfirmAction('reset')}
              disabled={Boolean(actionRunning)}
              className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono border border-zinc-800 transition-all min-h-[38px]"
              title="Reset game state"
            >
              Reset
            </button>

            <NavLink
              to="/admin/map"
              className="px-3.5 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 font-semibold text-xs border border-cyan-500/40 transition-all min-h-[38px] flex items-center gap-1.5 shadow-lg shadow-cyan-950/50"
            >
              <span>🗺️</span>
              <span>Live Field Radar →</span>
            </NavLink>
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

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Total Squads</span>
          <span className="text-2xl font-bold text-zinc-200 font-mono mt-1 tabular-nums">
            {teams.length}
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
                <span>Campus Landmark Occupancy Monitor</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                DISTRIBUTED PATHS
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Real-time station occupancy: 9 intermediate landmarks per squad + Grand Finale.
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
            const occupants: any[] = station.activeOccupants ?? [];

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
                  {station.isFinal ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold shrink-0">
                      FINALE
                    </span>
                  ) : occupants.length > 1 ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 font-bold shrink-0">
                      {occupants.length} SQUADS
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1 text-[11px] pt-1 border-t border-white/5">
                  {isOccupied && occupants.length > 0 ? (
                    occupants.map((occ: any, oIdx: number) => (
                      <div key={oIdx} className="flex items-center justify-between text-amber-300">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                          <span className="font-bold truncate text-[11px]">{occ.teamName}</span>
                        </div>
                        <span className="text-[9px] text-zinc-400 shrink-0">Step {occ.stepNumber}/10</span>
                      </div>
                    ))
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
              const activeProgress = team.levelProgress?.[0];
              const reachedLocation = Boolean(activeProgress?.locationReachedAt);
              const penaltyMinutesTotal = team.penalties?.reduce((acc: number, p: any) => acc + (p.minutes || 0), 0) ?? 0;

              return (
                <div
                  key={team.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isFinished
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

                    {/* Access code badge & copy/reset */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono">Code:</span>
                      <span className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                        {team.displayCode || '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(team.id, team.displayCode || '')}
                        className="text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 font-mono transition-all"
                        title="Copy access code to clipboard"
                      >
                        {copiedTeamId === team.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetCodeTeam(team);
                          setNewCodeInput('');
                        }}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/30 font-mono transition-all"
                        title="Reset access code"
                      >
                        🔑 Reset
                      </button>
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
                        {!reachedLocation && (
                          <button
                            onClick={() => handleBypassGps(team.id, team.name)}
                            disabled={isLoadingThis}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/40 transition-all active:scale-95 flex items-center gap-1 shadow-sm"
                            title="Bypass GPS check & decrypt clue text on squad's phone immediately"
                          >
                            <span>🔓</span>
                            <span>Bypass GPS</span>
                          </button>
                        )}

                        <button
                          onClick={() => setConfirmTeamAction({ type: 'advance', team })}
                          disabled={isLoadingThis}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 font-mono text-[11px] font-bold border border-cyan-500/40 transition-all active:scale-95 flex items-center gap-1"
                          title="Force complete current level and advance squad to next clue"
                        >
                          <span>⏩</span>
                          <span>Advance ➔</span>
                        </button>

                        <button
                          onClick={() => {
                            setJumpTeam(team);
                            setTargetJumpStep(Math.min(10, currentLevelOrder + 1));
                          }}
                          disabled={isLoadingThis}
                          className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-[11px] border border-zinc-700 transition-all"
                          title="Jump squad directly to any specific stage (1 to 10)"
                        >
                          🔀 Jump…
                        </button>

                        <button
                          onClick={() => setConfirmTeamAction({ type: 'finish', team })}
                          disabled={isLoadingThis}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md"
                        >
                          {isLoadingThis ? 'Verifying…' : 'Verify Finish'}
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

      {/* NON-BLOCKING IN-APP CONFIRMATION MODAL (Never suppressed by browser pop-up blockers) */}
      {confirmAction && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-rose-950 border border-rose-500/50 flex items-center justify-center text-xl shrink-0">
                {confirmAction === 'end' ? '⏹' : '⚠️'}
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmAction === 'end' ? 'Conclude Campus Hunt 2026?' : 'Reset All Progress to Standby?'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {confirmAction === 'end'
                    ? 'Official Field Action Directive'
                    : 'Emergency System Reset'}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              {confirmAction === 'end'
                ? 'Are you sure you want to officially END the hunt for all squads? All timers and field operations will freeze immediately, and final leaderboard standings will be permanently locked.'
                : 'Are you sure you want to RESET all teams, paths, scores, and timers back to initial idle standby? This will wipe the active session.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeGameAction(confirmAction)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg ${
                  confirmAction === 'end'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/80'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/80'
                }`}
              >
                {confirmAction === 'end' ? 'Yes, Conclude Hunt' : 'Yes, Reset State'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE JUMP EMERGENCY OVERRIDE MODAL */}
      {jumpTeam && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-xl shrink-0">
                🔀
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  Stage Override: {jumpTeam.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  Emergency Directive: Force move squad to target step
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                Select Destination Stage (1 to 10):
              </label>
              <div className="grid grid-cols-5 gap-2 font-mono text-xs">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((step) => {
                  const isSelected = targetJumpStep === step;
                  const isFinale = step === 10;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setTargetJumpStep(step)}
                      className={`py-2.5 rounded-xl font-bold border transition-all text-center flex flex-col items-center justify-center ${
                        isSelected
                          ? isFinale
                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-950'
                            : 'bg-cyan-500 border-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <span>Stage {step}</span>
                      {isFinale && <span className="text-[9px] uppercase tracking-wider">Finale 🏁</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] font-mono text-zinc-400 bg-zinc-950 p-3 rounded-xl border border-zinc-800 leading-relaxed">
              Moving {jumpTeam.name} to <strong>Stage {targetJumpStep}</strong> will mark prior objectives as cleared by admin override and instantly drop their Stage {targetJumpStep} landmark clue onto their device.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setJumpTeam(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteJumpStage}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs transition-all shadow-lg shadow-cyan-950"
              >
                Confirm Move to Stage {targetJumpStep} ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM TEAM ACTION MODAL (Advance / Finish) */}
      {confirmTeamAction && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                confirmTeamAction.type === 'finish'
                  ? 'bg-emerald-950 border-emerald-500/50 text-emerald-300'
                  : 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
              }`}>
                {confirmTeamAction.type === 'finish' ? '🏆' : '⏩'}
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmTeamAction.type === 'finish'
                    ? `Verify Podium Finish: "${confirmTeamAction.team.name}"`
                    : `Force Advance: "${confirmTeamAction.team.name}"`}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  {confirmTeamAction.type === 'finish'
                    ? 'Start Venue Podium Sign-Off'
                    : 'Emergency Field Directive'}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              {confirmTeamAction.type === 'finish'
                ? `Confirm official finish verification for ${confirmTeamAction.team.name}. Their final stopwatch time will be locked and posted to the official leaderboard podium.`
                : `Force complete current level for ${confirmTeamAction.team.name} and advance squad to the next stage along their route?`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmTeamAction(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmTeamAction.type === 'finish') {
                    handleVerifyFinish(confirmTeamAction.team.id, confirmTeamAction.team.name);
                  } else {
                    handleForceAdvance(confirmTeamAction.team.id, confirmTeamAction.team.name);
                  }
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg ${
                  confirmTeamAction.type === 'finish'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950'
                }`}
              >
                {confirmTeamAction.type === 'finish' ? 'Yes, Verify Finish' : 'Yes, Force Advance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ACCESS CODE MODAL */}
      {resetCodeTeam && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="font-semibold text-white text-sm">Reset Access Code</h3>
                <p className="text-xs text-cyan-400 font-mono">Squad: {resetCodeTeam.name}</p>
              </div>
              <button
                onClick={() => setResetCodeTeam(null)}
                className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewCode} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  New Access Code (letters & numbers):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCodeInput}
                    onChange={(e) => setNewCodeInput(e.target.value)}
                    placeholder="e.g. cyber26"
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500 uppercase tracking-wider"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateResetCode}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono"
                    title="Generate random password"
                  >
                    🎲 Gen
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
                Saving this will immediately update the squad's password and terminate any active sessions on their phones.
              </p>

              <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetCodeTeam(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingCode || !newCodeInput.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
                >
                  {isResettingCode ? 'Updating…' : 'Update Access Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
