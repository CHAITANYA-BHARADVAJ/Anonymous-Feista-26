import { useEffect } from 'react';
import { Ranking } from '../stores/gameStore';
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  TrophyIcon,
  XIcon,
} from './Icons';

interface SquadBreakdownModalProps {
  ranking: Ranking | null;
  onClose: () => void;
}

export function formatDurationSecs(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs)) return '—';
  const total = Math.max(0, Math.round(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatPenaltyLabel(kind: string): string {
  switch (kind) {
    case 'hint':
      return 'Hint Decryption';
    case 'zone':
      return 'Restricted Zone Breach';
    case 'admin_penalty':
      return 'Coordinator Penalty';
    case 'admin_bonus':
      return 'Coordinator Time Bonus';
    case 'checkpoint_bonus':
      return 'Checkpoint Time Bonus';
    default:
      return kind.replace(/_/g, ' ');
  }
}

export default function SquadBreakdownModal({ ranking, onClose }: SquadBreakdownModalProps) {
  useEffect(() => {
    if (!ranking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ranking, onClose]);

  if (!ranking) return null;

  const pct = ranking.totalSteps > 0
    ? Math.min(100, Math.round((ranking.completedStages / ranking.totalSteps) * 100))
    : 0;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2200] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="obsidian-surface rounded-3xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in text-zinc-100"
      >
        {/* Top Dossier Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-start justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center font-mono font-black text-base shrink-0 ${
                ranking.rank === 1 && ranking.finished
                  ? 'bg-amber-500/20 border-amber-500/45 text-amber-300'
                  : ranking.rank === 2 && ranking.finished
                  ? 'bg-zinc-400/15 border-zinc-400/40 text-zinc-200'
                  : ranking.rank === 3 && ranking.finished
                  ? 'bg-amber-800/25 border-amber-700/45 text-amber-400'
                  : 'bg-white/[0.04] border-white/10 text-cyan-300'
              }`}
            >
              {ranking.rank === 1 && ranking.finished ? <TrophyIcon className="w-5 h-5" /> : `#${ranking.rank}`}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  SQUAD TELEMETRY DOSSIER
                </span>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                    ranking.finished
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : ranking.completedStages > 0 || ranking.currentLevel > 0
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {ranking.finished ? 'Verified Finish' : ranking.currentLevel > 0 ? 'Active In Field' : 'Standby'}
                </span>
                {ranking.latestPhotoStatus && (
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                      ranking.latestPhotoStatus === 'approved'
                        ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                        : ranking.latestPhotoStatus === 'rejected'
                        ? 'bg-rose-950/70 border-rose-500/40 text-rose-300'
                        : 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    Photo: {ranking.latestPhotoStatus}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white tracking-tight truncate mt-0.5">
                {ranking.teamName}
              </h3>
              <p className="text-xs font-mono text-zinc-400 mt-0.5 truncate">
                Current Objective: <span className="text-zinc-200">{ranking.currentStageTitle}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close squad telemetry dossier"
            className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Official Time Audit Equation */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono">
            <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Base Elapsed</span>
              <span className="text-sm font-bold text-white tabular-nums mt-1 block">
                {ranking.finished ? formatDurationSecs(ranking.rawElapsedSecs) : 'Racing'}
              </span>
            </div>

            <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Hint Penalty</span>
              <span className={`text-sm font-bold tabular-nums mt-1 block ${ranking.hintPenaltyMins > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>
                +{ranking.hintPenaltyMins}m
              </span>
              <span className="text-[10px] text-zinc-500">{ranking.hintsUsedCount} revealed</span>
            </div>

            <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Zone Breach</span>
              <span className={`text-sm font-bold tabular-nums mt-1 block ${ranking.zonePenaltyMins > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                +{ranking.zonePenaltyMins}m
              </span>
            </div>

            <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Admin / Bonus</span>
              <span
                className={`text-sm font-bold tabular-nums mt-1 block ${
                  ranking.adminPenaltyMins - ranking.bonusMins > 0
                    ? 'text-rose-400'
                    : ranking.adminPenaltyMins - ranking.bonusMins < 0
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                {ranking.adminPenaltyMins - ranking.bonusMins > 0 ? '+' : ''}
                {ranking.adminPenaltyMins - ranking.bonusMins}m
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-cyan-950/35 border border-cyan-500/35 rounded-2xl p-3">
              <span className="text-[9px] uppercase tracking-wider text-cyan-300 font-bold block">Adjusted Time</span>
              <span className="text-base font-black text-emerald-300 tabular-nums mt-1 block">
                {ranking.finished ? formatDurationSecs(ranking.adjustedTimeSecs) : '—'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400 uppercase tracking-wider text-[10px] font-bold">
                Mission Progression
              </span>
              <span className="text-white font-bold tabular-nums">
                {ranking.completedStages} / {ranking.totalSteps} Stages Cleared ({pct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-zinc-900 border border-white/[0.06] overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  ranking.finished
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stage-by-Stage Split Timeline */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <FlagIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>Stage-by-Stage Split Timeline</span>
              </h4>
              <span className="text-[10px] font-mono text-zinc-500">
                {ranking.stageBreakdown.length} unlocked
              </span>
            </div>

            {ranking.stageBreakdown.length === 0 ? (
              <div className="bg-[#07080b] border border-white/[0.06] rounded-2xl p-6 text-center text-xs font-mono text-zinc-500">
                No stages unlocked yet. Waiting for event launch.
              </div>
            ) : (
              <div className="space-y-2">
                {ranking.stageBreakdown.map((stage) => {
                  const isDone = Boolean(stage.completedAt);
                  const reached = Boolean(stage.locationReachedAt);
                  return (
                    <div
                      key={`${stage.stepNumber}-${stage.title}`}
                      className={`rounded-2xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono ${
                        isDone
                          ? 'bg-emerald-950/15 border-emerald-500/25'
                          : 'bg-[#07080b] border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 ${
                            stage.isFinal
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : isDone
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35'
                          }`}
                        >
                          {stage.isFinal ? 'FIN' : String(stage.stepNumber).padStart(2, '0')}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-sans font-bold text-white text-sm truncate">
                              {stage.title}
                            </span>
                            {isDone ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase font-bold inline-flex items-center gap-1">
                                <CheckIcon className="w-2.5 h-2.5" />
                                {stage.completedBy === 'admin_override' ? 'Admin Advance' : 'Solved'}
                              </span>
                            ) : reached ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase font-bold">
                                Clue Decrypted
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase font-bold">
                                En Route
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 mt-1">
                            <span>
                              Unlocked: {new Date(stage.unlockedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            {stage.locationReachedAt && (
                              <span>
                                GPS Arrived: {new Date(stage.locationReachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                            {stage.hintsUsed > 0 && (
                              <span className="text-amber-300">Hints: {stage.hintsUsed}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:text-right shrink-0 pl-9 sm:pl-0">
                        <ClockIcon className="w-3.5 h-3.5 text-zinc-500" />
                        <span className={`font-bold tabular-nums ${isDone ? 'text-emerald-300' : 'text-cyan-300'}`}>
                          {isDone ? formatDurationSecs(stage.durationSecs) : 'Active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Penalty & Bonus Log */}
          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Penalties & Adjustments Log ({ranking.penaltyLog.length})</span>
            </h4>

            {ranking.penaltyLog.length === 0 ? (
              <div className="bg-[#07080b] border border-white/[0.06] rounded-2xl p-4 text-center text-xs font-mono text-emerald-400/80">
                Clean run — zero penalties or breaches recorded.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] bg-[#07080b] border border-white/[0.07] rounded-2xl overflow-hidden font-mono text-xs">
                {ranking.penaltyLog.map((entry) => (
                  <div key={`${entry.id}-${entry.appliedAt}`} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-zinc-200 font-semibold">{formatPenaltyLabel(entry.kind)}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {new Date(entry.appliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <span
                      className={`font-bold tabular-nums px-2 py-0.5 rounded-lg border text-[11px] ${
                        entry.minutes > 0
                          ? 'bg-rose-950/60 border-rose-500/35 text-rose-300'
                          : 'bg-emerald-950/60 border-emerald-500/35 text-emerald-300'
                      }`}
                    >
                      {entry.minutes > 0 ? `+${entry.minutes}m` : `${entry.minutes}m`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
