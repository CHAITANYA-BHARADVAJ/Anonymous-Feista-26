import { useEffect, useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useUiStore } from '../../stores/uiStore';
import { AlertTriangleIcon } from '../../components/Icons';

export default function AdminGame() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [pendingPhotosCount, setPendingPhotosCount] = useState<number>(0);
  const [occupancyMatrix, setOccupancyMatrix] = useState<any[]>([]);
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'end' | 'reset' | null>(null);
  const [actionLoadingTeamId, setActionLoadingTeamId] = useState<number | null>(null);

  // Active contextual menu dropdown
  const [openMenuTeamId, setOpenMenuTeamId] = useState<number | null>(null);

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

  // Emergency Stage Jump state
  const [jumpTeam, setJumpTeam] = useState<any | null>(null);
  const [targetJumpStep, setTargetJumpStep] = useState<number>(1);
  const [confirmTeamAction, setConfirmTeamAction] = useState<{ type: 'advance' | 'finish'; team: any } | null>(null);

  // Team Access Code Reset & Copy state
  const [resetCodeTeam, setResetCodeTeam] = useState<any | null>(null);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [isResettingCode, setIsResettingCode] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState<number | null>(null);
  const toast = useUiStore((s) => s.toast);

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
      addLog(`Access code updated for ${resetCodeTeam.name} to "${res.displayCode}"`, 'warn');
      toast(`Access code updated for ${resetCodeTeam.name}`, 'success');
      setResetCodeTeam(null);
      setNewCodeInput('');
      await reload();
    } catch (err: any) {
      toast(err.message ?? 'Failed to update access code', 'error');
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
      addLog(`Status changed to: ${(statusData.status || '').toUpperCase()}`, 'info');
      reload();
    };

    socket.on('game:status_changed', handleStatus);
    socket.on('game:status', handleStatus);

    socket.on('admin:photo_submitted', (data: any) => {
      const teamLabel = data?.photo?.team?.name ?? data?.teamName ?? 'Team';
      addLog(`New verification photo submitted by ${teamLabel}`, 'info');
      reload();
    });

    socket.on('admin:occupancy_update', (matrix: any[]) => {
      setOccupancyMatrix(matrix);
    });

    socket.on('admin:zone_breach', (data: any) => {
      addLog(
        `ZONE BREACH: ${data.teamName ?? 'Team'} entered ${data.label ?? 'Restricted Area'} (+${data.penaltyMins}m)`,
        'alert',
      );
      reload();
    });

    socket.on('team:checkpoint_reached', (data: any) => {
      addLog(`${data.teamName} reached target for ${data.levelTitle}`, 'success');
      reload();
    });

    socket.on('level:unlocked', () => {
      reload();
    });

    socket.on('winner:declared', (data: any) => {
      addLog(`WINNER: ${data.teamName} completed the hunt!`, 'success');
      reload();
    });

    return () => {
      socket.off('game:status_changed', handleStatus);
      socket.off('game:status', handleStatus);
      socket.off('admin:photo_submitted');
      socket.off('admin:occupancy_update');
      socket.off('admin:zone_breach');
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
      const updated: any = await api.patchGameStatus(game?.id, action);
      if (updated) {
        setGame((g: any) => ({ ...(g || {}), ...updated }));
        addLog(`Directive applied: ${(updated.status || action).toUpperCase()}`, 'success');
      }
      await reload();
    } catch (err: any) {
      addLog(`Action failed (${action}): ${err.message}`, 'alert');
      toast(`Action Failed: ${err.message ?? 'Unknown error'}`, 'error');
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
      toast('Broadcast transmitted to field.', 'success');
      setBroadcastMsg('');
    } catch (err: any) {
      toast(err.message ?? 'Transmission failed', 'error');
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
      toast(`Verified finish for ${teamName}`, 'success');
    } catch (err: any) {
      toast(err.message ?? 'Verification failed', 'error');
    } finally {
      setActionLoadingTeamId(null);
      setConfirmTeamAction(null);
    }
  }

  async function handleBypassGps(teamId: number, teamName: string) {
    setActionLoadingTeamId(teamId);
    try {
      const res = await api.bypassTeamGps(teamId);
      addLog(`GPS bypassed for ${teamName}: ${res.levelTitle ?? 'Clue'} decrypted`, 'success');
      toast(`GPS bypassed for ${teamName}`, 'success');
      await reload();
    } catch (err: any) {
      toast(err.message ?? 'Could not bypass GPS check', 'error');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  async function handleForceAdvance(teamId: number, teamName: string) {
    setActionLoadingTeamId(teamId);
    try {
      const res = await api.forceAdvanceTeam(teamId);
      addLog(`Advanced ${teamName} to Stage ${res.nextStepNumber ?? 'Next'}`, 'warn');
      toast(`Advanced ${teamName} to Stage ${res.nextStepNumber ?? 'Next'}`, 'info');
      await reload();
    } catch (err: any) {
      toast(err.message ?? 'Could not advance level', 'error');
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
      addLog(`Moved ${jumpTeam.name} to Stage ${targetJumpStep}`, 'warn');
      toast(`Moved ${jumpTeam.name} to Stage ${targetJumpStep}`, 'info');
      setJumpTeam(null);
      await reload();
    } catch (err: any) {
      toast(err.message ?? 'Failed to jump squad stage', 'error');
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
      toast(`Adjusted time for ${penaltyTeam.name}`, 'info');
      setPenaltyTeam(null);
      await reload();
    } catch (err: any) {
      toast(err.message ?? 'Failed to apply adjustment', 'error');
    }
  }

  async function handleSendNudge() {
    if (!game || !nudgeTeam || !nudgeText.trim()) return;
    try {
      await api.sendAnnouncement(game.id, nudgeText.trim(), 'nudge', nudgeTeam.id);
      addLog(`Nudge sent to ${nudgeTeam.name}: "${nudgeText.trim()}"`, 'info');
      toast(`Nudge sent to ${nudgeTeam.name}`, 'success');
      setNudgeTeam(null);
      setNudgeText('');
    } catch (err: any) {
      toast(err.message ?? 'Failed to transmit nudge', 'error');
    }
  }

  const totalSteps = useMemo(() => {
    if (levels.length === 0) return 11;
    const intermediateCount = levels.filter((l) => !l.isFinal).length;
    const hasFinal = levels.some((l) => l.isFinal);
    return Math.min(10, intermediateCount) + (hasFinal ? 1 : 0);
  }, [levels]);

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      const isFinished = Boolean(t.finishedAt);
      const activeProg = t.levelProgress?.find((p: any) => !p.completedAt) ?? t.levelProgress?.[0];
      const currentStepNumber = activeProg?.stepNumber ?? 1;
      const isFinalLevel = Boolean(activeProg?.level?.isFinal) || (totalSteps > 0 && currentStepNumber >= totalSteps);

      if (filter === 'active') return !isFinished;
      if (filter === 'finished') return isFinished;
      if (filter === 'final') return !isFinished && isFinalLevel;
      return true;
    });
  }, [teams, search, filter, totalSteps]);

  const stats = useMemo(() => {
    const total = teams.length;
    const finished = teams.filter((t) => t.finishedAt).length;
    const active = total - finished;
    const atFinale = teams.filter((t) => {
      if (t.finishedAt) return false;
      const activeProg = t.levelProgress?.find((p: any) => !p.completedAt) ?? t.levelProgress?.[0];
      const currentStepNumber = activeProg?.stepNumber ?? 1;
      return Boolean(activeProg?.level?.isFinal) || (totalSteps > 0 && currentStepNumber >= totalSteps);
    }).length;

    return { total, finished, active, atFinale };
  }, [teams, totalSteps]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* 1. TOP COMMAND BAR */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-white">{game?.name ?? 'SDMCET Campus Hunt'}</h2>
            {game && (
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase tracking-wide border ${
                  game.status === 'running'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : game.status === 'paused'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {game.status}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 font-mono">
            Campus Hunt Command Desk • SDMCET Dharwad
          </p>
        </div>

        {/* Master Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Stopwatch */}
          <div className="bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800 flex items-center gap-2.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Elapsed:</span>
            <span className="text-lg font-mono font-bold text-zinc-100 tabular-nums">
              {elapsedFormatted}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {game?.status === 'idle' && (
              <button
                onClick={() => executeGameAction('start')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow"
              >
                {actionRunning === 'start' ? 'Starting…' : 'Start Event'}
              </button>
            )}

            {game?.status === 'running' && (
              <button
                onClick={() => executeGameAction('pause')}
                disabled={Boolean(actionRunning)}
                className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 9v6m4-6v6" />
                </svg>
                <span>Pause</span>
              </button>
            )}

            {game?.status === 'paused' && (
              <button
                onClick={() => executeGameAction('resume')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow active:scale-95"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Resume</span>
              </button>
            )}

            {(game?.status === 'running' || game?.status === 'paused') && (
              <button
                onClick={() => setConfirmAction('end')}
                disabled={Boolean(actionRunning)}
                className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-bold text-xs border border-rose-700/60 transition-all flex items-center gap-1 active:scale-95"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
                <span>End</span>
              </button>
            )}

            {game?.status === 'ended' && (
              <button
                onClick={() => executeGameAction('start')}
                disabled={Boolean(actionRunning)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-all"
              >
                Relaunch
              </button>
            )}

            <button
              onClick={() => setConfirmAction('reset')}
              disabled={Boolean(actionRunning)}
              className="px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono border border-zinc-800 transition-all"
              title="Reset game state"
            >
              Reset
            </button>

            <NavLink
              to="/admin/map"
              className="px-3.5 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 font-bold text-xs border border-cyan-500/40 transition-all flex items-center gap-1.5"
            >
              <span>Field Radar →</span>
            </NavLink>
          </div>
        </div>
      </div>

      {/* 2. CONSOLIDATED KPI TILES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Active in Field</span>
          <span className="text-2xl font-bold text-emerald-400 font-mono mt-1 tabular-nums">{stats.active}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">At Finale Sprint</span>
          <span className="text-2xl font-bold text-purple-300 font-mono mt-1 tabular-nums">{stats.atFinale}</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-400 uppercase">Verified Finished</span>
          <span className="text-2xl font-bold text-zinc-100 font-mono mt-1 tabular-nums">{stats.finished}</span>
        </div>

        <NavLink
          to="/admin/photos"
          className={`rounded-2xl p-3.5 flex flex-col justify-between transition-all ${
            pendingPhotosCount > 0
              ? 'bg-amber-950/40 border border-amber-500/60 text-amber-300'
              : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400'
          }`}
        >
          <span className="text-[10px] font-mono uppercase">Photo Queue</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-bold font-mono tabular-nums ${pendingPhotosCount > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>
              {pendingPhotosCount}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 underline">review →</span>
          </div>
        </NavLink>
      </div>

      {/* 3. COMPACT LANDMARK OCCUPANCY MATRIX */}
      {occupancyMatrix.length > 0 && (
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">
              Landmark Occupancy ({occupancyMatrix.filter((m) => m.isOccupied).length} Active / {occupancyMatrix.length} Stations)
            </span>
          </div>

          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
            {occupancyMatrix.map((station) => {
              const isOccupied = station.isOccupied;
              const occupants: any[] = station.activeOccupants ?? [];

              return (
                <div
                  key={station.levelId}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
                    station.isFinal
                      ? 'bg-purple-950/30 border-purple-500/40 text-purple-300'
                      : isOccupied
                      ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <span className="font-bold">#{station.orderIndex} {station.title}</span>
                  {isOccupied && occupants.length > 0 && (
                    <span className="text-[10px] bg-amber-400/20 px-1 rounded text-amber-300">
                      {occupants.map((o) => o.teamName).join(', ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. BROADCAST TRANSMITTER */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-zinc-300 mr-2">Broadcast:</span>
          {[
            'Hunt is underway!',
            '15-Minute Warning: Clue closing soon.',
            'Target spotted near Sports Complex bleachers.',
            'Hold position: Timers paused.',
          ].map((preset) => (
            <button
              key={preset}
              onClick={() => setBroadcastMsg(preset)}
              className="text-[11px] font-mono bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded-lg border border-zinc-800 transition-all truncate"
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
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Type message to appear on team phones…"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500"
          />

          <button
            type="submit"
            disabled={isBroadcasting || !broadcastMsg.trim()}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-all min-h-[38px] flex items-center justify-center gap-1"
          >
            {isBroadcasting ? 'Sending…' : 'Transmit'}
          </button>
        </form>
      </div>

      {/* 5. STREAMLINED TEAM OPERATIONS & LIVE ACTIVITY LOG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Teams List (8 cols) */}
        <div className="lg:col-span-8 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-100">
              Team Operations ({filteredTeams.length} / {teams.length})
            </span>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
                className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500 w-36"
              />

              {/* Filter Pills */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[10px] font-mono">
                {(['all', 'active', 'finished'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 rounded capitalize ${filter === f ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <NavLink
                to="/admin/teams"
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono"
              >
                + Roster
              </NavLink>
            </div>
          </div>

          {/* Clean, De-cluttered Team Rows */}
          <div className="space-y-2 mt-1">
            {filteredTeams.map((team) => {
              const activeProgress = team.levelProgress?.find((p: any) => !p.completedAt) ?? team.levelProgress?.[0];
              const teamTotalSteps = team.totalSteps ?? totalSteps;
              const currentStepNumber = activeProgress?.stepNumber ?? 1;
              const isFinished = Boolean(team.finishedAt);
              const isLoadingThis = actionLoadingTeamId === team.id;
              const reachedLocation = Boolean(activeProgress?.locationReachedAt);
              const penaltyMinutesTotal = team.penalties?.reduce((acc: number, p: any) => acc + (p.minutes || 0), 0) ?? 0;
              const isAtFinale = Boolean(activeProgress?.level?.isFinal) || (teamTotalSteps > 0 && currentStepNumber >= teamTotalSteps);
              const isMenuOpen = openMenuTeamId === team.id;

              return (
                <div
                  key={team.id}
                  className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs relative ${
                    isFinished
                      ? 'bg-emerald-950/15 border-emerald-500/30'
                      : 'bg-zinc-950/60 border-zinc-800/80'
                  }`}
                >
                  {/* Left: Squad Info */}
                  <div className="flex flex-col gap-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{team.name}</span>
                      {isFinished ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold">
                          FINISHED
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          Stage {currentStepNumber}/{teamTotalSteps}
                          {activeProgress?.level?.title ? ` · ${activeProgress.level.title}` : ''}
                        </span>
                      )}

                      {/* GPS indicator dot */}
                      {!isFinished && (
                        <span
                          className={`w-2 h-2 rounded-full ${reachedLocation ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                          title={reachedLocation ? 'GPS target reached' : 'Approaching landmark'}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-zinc-500">Code:</span>
                      <span className="text-amber-300 font-bold select-all">
                        {team.displayCode || '••••••'}
                      </span>
                      {team.displayCode && (
                        <button
                          type="button"
                          onClick={() => handleCopyCode(team.id, team.displayCode)}
                          className="text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 transition-colors flex items-center gap-1"
                          title="Copy access code"
                        >
                          {copiedTeamId === team.id ? (
                            <>
                              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}

                      {penaltyMinutesTotal !== 0 && (
                        <span className={`ml-1 font-bold ${penaltyMinutesTotal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {penaltyMinutesTotal > 0 ? `+${penaltyMinutesTotal}` : penaltyMinutesTotal}m
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Streamlined Action Controls */}
                  <div className="flex items-center gap-2">
                    {!isFinished ? (
                      <>
                        {/* Primary Action Button */}
                        {isAtFinale ? (
                          <button
                            onClick={() => setConfirmTeamAction({ type: 'finish', team })}
                            disabled={isLoadingThis}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{isLoadingThis ? 'Verifying…' : 'Verify Finish'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmTeamAction({ type: 'advance', team })}
                            disabled={isLoadingThis}
                            className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-all active:scale-95 shadow flex items-center gap-1"
                          >
                            <span>Advance</span>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </button>
                        )}

                        {/* More Actions Dropdown Toggle */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuTeamId(isMenuOpen ? null : team.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs border border-zinc-700 transition-all flex items-center gap-1 active:scale-95"
                            title="More squad actions"
                          >
                            <span>Actions</span>
                            <svg className={`w-3 h-3 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Popover Menu with backdrop */}
                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuTeamId(null)} />
                              <div className="absolute right-0 top-full mt-1.5 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1 z-50 flex flex-col gap-0.5 text-xs font-mono animate-fade-in">
                                {!reachedLocation && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuTeamId(null);
                                      handleBypassGps(team.id, team.name);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-950/40 text-emerald-300 flex items-center gap-2 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    </svg>
                                    <span>Bypass GPS</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setOpenMenuTeamId(null);
                                    setJumpTeam(team);
                                    setTargetJumpStep(Math.min(totalSteps, currentStepNumber + 1));
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                  </svg>
                                  <span>Jump Stage…</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setOpenMenuTeamId(null);
                                    setPenaltyTeam(team);
                                    setPenaltyMinutes(5);
                                    setPenaltyReason('Time adjustment');
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span>Adjust Time</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setOpenMenuTeamId(null);
                                    setNudgeTeam(team);
                                    setNudgeText('');
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/40 text-cyan-300 flex items-center gap-2 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  <span>Radio Nudge</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setOpenMenuTeamId(null);
                                    setResetCodeTeam(team);
                                    setNewCodeInput('');
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-950/40 text-amber-300 flex items-center gap-2 border-t border-zinc-800/80 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                  </svg>
                                  <span>Reset Code</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
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

        {/* Right: Live Activity Feed (4 cols) */}
        <div className="lg:col-span-4 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-100">Live Activity Feed</span>
            <span className="text-[10px] font-mono text-zinc-500">Real-time</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[460px] pr-1 font-mono text-[11px]">
            {activityLogs.length === 0 ? (
              <p className="text-zinc-600 text-xs py-8 text-center">Activity will stream here live…</p>
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

      {/* MODALS */}
      {/* NUDGE MODAL */}
      {nudgeTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <h3 className="font-semibold text-white text-sm">Nudge {nudgeTeam.name}</h3>

            <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
              {['Getting warmer!', 'Getting colder…', 'Target nearby!', 'Check library lawn'].map((msg) => (
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

      {/* CONFIRM GAME ACTION MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-rose-950 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangleIcon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmAction === 'end' ? 'Conclude Campus Hunt?' : 'Reset All Progress?'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {confirmAction === 'end' ? 'End event for all squads' : 'Emergency State Reset'}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              {confirmAction === 'end'
                ? 'End the hunt for all squads? All timers and field operations will freeze immediately, and final standings will be locked.'
                : 'Reset all teams, paths, scores, and timers back to initial standby?'}
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
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {confirmAction === 'end' ? 'Yes, Conclude Hunt' : 'Yes, Reset State'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE JUMP MODAL */}
      {jumpTeam && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100">
            <h3 className="text-base font-bold text-white">
              Stage Override: {jumpTeam.name}
            </h3>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 font-mono text-xs">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
                const isSelected = targetJumpStep === step;
                return (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setTargetJumpStep(step)}
                    className={`py-2 rounded-xl font-bold border transition-all text-center ${
                      isSelected
                        ? 'bg-zinc-100 text-zinc-950 border-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    {step === totalSteps ? `S${step} (End)` : `Stage ${step}`}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setJumpTeam(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteJumpStage}
                className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-bold text-xs"
              >
                Confirm Move ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM TEAM ACTION MODAL */}
      {confirmTeamAction && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-zinc-100">
            <h3 className="text-base font-bold text-white">
              {confirmTeamAction.type === 'finish'
                ? `Verify Finish: "${confirmTeamAction.team.name}"`
                : `Advance: "${confirmTeamAction.team.name}"`}
            </h3>

            <p className="text-xs text-zinc-300 font-mono bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              {confirmTeamAction.type === 'finish'
                ? `Confirm official podium finish for ${confirmTeamAction.team.name}. Their elapsed time will be locked.`
                : `Advance ${confirmTeamAction.team.name} to their next stage?`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmTeamAction(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium"
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
                className={`px-4 py-2 rounded-xl font-bold text-xs ${
                  confirmTeamAction.type === 'finish'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-zinc-100 hover:bg-white text-zinc-950'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TIME ADJUSTMENT MODAL */}
      {penaltyTeam && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <h3 className="font-semibold text-white text-sm">Time Adjustment: {penaltyTeam.name}</h3>

            <form onSubmit={handleApplyPenalty} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Minutes (+ penalty / - bonus)</label>
                <input
                  type="number"
                  value={penaltyMinutes}
                  onChange={(e) => setPenaltyMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Reason</label>
                <input
                  type="text"
                  value={penaltyReason}
                  onChange={(e) => setPenaltyReason(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPenaltyTeam(null)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET ACCESS CODE MODAL */}
      {resetCodeTeam && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="font-semibold text-white text-sm">Reset Code: {resetCodeTeam.name}</h3>
              <button
                onClick={() => setResetCodeTeam(null)}
                className="text-zinc-400 hover:text-white font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewCode} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCodeInput}
                  onChange={(e) => setNewCodeInput(e.target.value)}
                  placeholder="New code…"
                  className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white"
                  required
                />
                <button
                  type="button"
                  onClick={generateResetCode}
                  className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-mono"
                >
                  🎲
                </button>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetCodeTeam(null)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingCode || !newCodeInput.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-zinc-950 text-xs font-bold font-mono"
                >
                  {isResettingCode ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
