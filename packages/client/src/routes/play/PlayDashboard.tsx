import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Circle, Marker, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useLocation } from '../../hooks/useLocation';
import { useStopwatch, formatMs } from '../../hooks/useCountdown';
import { api } from '../../lib/api';
import { disconnectSocket } from '../../lib/socket';
import { computeDistanceMeters, computeBearingDegrees } from '../../lib/geo';
import { playClueUnlockedSound, playSuccessSound, playErrorSound, triggerHaptic } from '../../lib/sound';
import {
  announceArenaWelcome,
  announceClueDecrypted,
  announceStageAdvance,
  primeSpeechEngine,
  stopPaVoice,
} from '../../lib/voice';
import QrCodeDisplay from '../../components/QrCodeDisplay';
import GpsCalibrationModal from '../../components/GpsCalibrationModal';
import {
  requestFullscreen,
  isFullscreen,
  toggleFullscreen,
  enableAutoFullscreenOnFirstGesture,
} from '../../lib/fullscreen';
import {
  SDMCET_CENTER,
  SDMCET_MAX_BOUNDS,
  SDMCET_CAMPUS_POLYGON,
  SATELLITE_SOURCES,
} from '../../lib/mapConfig';
import { MapResizer } from '../../components/MapResizer';
import DistanceRadar from '../../components/DistanceRadar';
import ClueDropModal from '../../components/ClueDropModal';
import ZoneWarning from '../../components/ZoneWarning';
import AnnouncementBanner from '../../components/AnnouncementBanner';
import PaVoiceBanner from '../../components/PaVoiceBanner';
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckIcon,
  ChevronUpIcon,
  FlagIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  MaximizeIcon,
  PauseIcon,
  RadarIcon,
  SatelliteIcon,
  SquidSymbolsIcon,
  TrophyIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  XIcon,
} from '../../components/Icons';

// Custom player pin icon
const playerIcon = L.divIcon({
  className: 'custom-player-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-8 h-8 rounded-full bg-cyan-400/25 animate-ping"></div>
    <div class="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-zinc-950 shadow-xl"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Custom target landmark pin icon
const targetIcon = L.divIcon({
  className: 'custom-target-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="w-7 h-7 rounded-full bg-emerald-400 border-2 border-zinc-950 shadow-2xl flex items-center justify-center text-xs text-zinc-950 font-black font-mono">✓</div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Controller to auto-center map on first GPS fix
function CenterController({ pos }: { pos: GeolocationCoordinates | null }) {
  const map = useMap();
  const centeredOnce = useRef(false);

  useEffect(() => {
    if (pos && !centeredOnce.current) {
      const inCampus =
        pos.latitude >= SDMCET_MAX_BOUNDS[0][0] &&
        pos.latitude <= SDMCET_MAX_BOUNDS[1][0] &&
        pos.longitude >= SDMCET_MAX_BOUNDS[0][1] &&
        pos.longitude <= SDMCET_MAX_BOUNDS[1][1];

      if (inCampus) {
        map.setView([pos.latitude, pos.longitude], 18);
      } else {
        map.setView(SDMCET_CENTER, 18);
      }
      centeredOnce.current = true;
    }
  }, [pos, map]);
  return null;
}

export default function PlayDashboard() {
  const navigate = useNavigate();

  // Stores
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const progress = useGameStore((s) => s.progress);
  const totalSteps = useGameStore((s) => s.totalSteps);
  const rankings = useGameStore((s) => s.rankings);
  const setProgress = useGameStore((s) => s.setProgress);
  const setTotalSteps = useGameStore((s) => s.setTotalSteps);
  const latestPhoto = useGameStore((s) => s.latestPhoto);
  const setLatestPhoto = useGameStore((s) => s.setLatestPhoto);
  const connected = useGameStore((s) => s.connected);

  const teamName = useAuthStore((s) => s.teamName);
  const teamId = useAuthStore((s) => s.teamId);
  const clearAuth = useAuthStore((s) => s.clear);

  const toast = useUiStore((s) => s.toast);
  const uiConfirm = useUiStore((s) => s.confirm);
  const voiceMuted = useVoiceStore((s) => s.muted);
  const toggleVoiceMute = useVoiceStore((s) => s.toggleMute);

  // Device & Location Hooks
  const { pos, refreshLocation } = useLocation();

  // Local UI States
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(true);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showClueModal, setShowClueModal] = useState<boolean>(false);
  const [showGpsModal, setShowGpsModal] = useState<boolean>(false);

  // Mission Action States
  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [answerLoading, setAnswerLoading] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [hintLoading, setHintLoading] = useState<number | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoStatus = latestPhoto?.status ?? null;

  // Map & Level Derived
  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;
  const level = currentLevel?.level;
  const targetLat = level?.targetLat;
  const targetLng = level?.targetLng;
  const triggerRadius = level?.triggerRadiusMeters ?? 25;
  const hasGpsTarget = Boolean(level && targetLat != null && targetLng != null);
  const locationReached = !hasGpsTarget || Boolean(currentLevel?.locationReachedAt);
  const isCompleted = !!currentLevel?.completedAt;
  const completedCount = progress.filter((p) => p.completedAt).length;
  const currentStep = (currentLevel as any)?.stepNumber ?? (completedCount + 1);
  const isFinalStep = Boolean(level?.isFinal || currentStep >= totalSteps);

  // Check verified podium finish from live rankings
  const myRanking = useMemo(
    () => rankings.find((r) => r.teamId === teamId),
    [rankings, teamId],
  );
  const isVerifiedFinished = Boolean(myRanking?.finished);

  const revealedHintIds = useMemo(
    () => new Set(currentLevel?.hintReveals.map((r) => r.hintId) ?? []),
    [currentLevel?.hintReveals],
  );

  // Auto-expand sheet and reset input whenever active level progresses
  const prevLevelIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentLevel?.levelId && currentLevel.levelId !== prevLevelIdRef.current) {
      prevLevelIdRef.current = currentLevel.levelId;
      setIsSheetExpanded(true);
      setAnswer('');
      setAnswerError('');
    }
  }, [currentLevel?.levelId]);

  // Expand sheet when verified finish arrives or when a submitted photo is rejected
  useEffect(() => {
    if (isVerifiedFinished || latestPhoto?.status === 'rejected') {
      setIsSheetExpanded(true);
    }
  }, [isVerifiedFinished, latestPhoto?.status, latestPhoto?.id]);

  // Fullscreen tracking & Squid Game PA intro briefing on portal entry
  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    const updateFs = () => setFullscreenActive(isFullscreen());
    updateFs();
    document.addEventListener('fullscreenchange', updateFs);
    document.addEventListener('webkitfullscreenchange', updateFs);

    const pendingIntro = sessionStorage.getItem('ch-pa-pending-intro') === '1';
    const introAlreadyPlayed = sessionStorage.getItem('ch-pa-intro-done') === '1';
    let introTimer: ReturnType<typeof setTimeout> | null = null;

    if (pendingIntro || !introAlreadyPlayed) {
      sessionStorage.removeItem('ch-pa-pending-intro');
      sessionStorage.setItem('ch-pa-intro-done', '1');
      introTimer = setTimeout(() => {
        announceArenaWelcome(teamName);
      }, 450);
    }

    return () => {
      if (introTimer) clearTimeout(introTimer);
      cleanup();
      document.removeEventListener('fullscreenchange', updateFs);
      document.removeEventListener('webkitfullscreenchange', updateFs);
    };
  }, []);

  // Distance & Bearing calculations
  const distanceMeters = useMemo(() => {
    if (!pos || targetLat == null || targetLng == null) return null;
    return computeDistanceMeters(pos.latitude, pos.longitude, targetLat, targetLng);
  }, [pos?.latitude, pos?.longitude, targetLat, targetLng]);

  const bearingDegrees = useMemo(() => {
    if (!pos || targetLat == null || targetLng == null) return null;
    return computeBearingDegrees(pos.latitude, pos.longitude, targetLat, targetLng);
  }, [pos?.latitude, pos?.longitude, targetLat, targetLng]);

  // Global Mission Stopwatch & Hint Penalties
  const { formatted: elapsedFormatted } = useStopwatch(
    game?.startedAt,
    game?.pausedAt,
    game?.totalPausedMs ?? 0,
    game?.endedAt,
  );

  const totalHintPenaltiesMins = useMemo(() => {
    let mins = 0;
    for (const p of progress) {
      if (p.level?.hints) {
        const revealed = new Set(p.hintReveals?.map((hr) => hr.hintId) ?? []);
        for (const h of p.level.hints) {
          if (revealed.has(h.id)) {
            mins += h.penaltyMins;
          }
        }
      }
    }
    return mins;
  }, [progress]);

  // Proximity Check-in Action
  async function triggerCheckIn() {
    if (!currentLevel || !level || !pos || checkInLoading) return;
    if (game?.status !== 'running') {
      toast(
        game?.status === 'paused' ? 'Hunt is temporarily PAUSED by Event Control.' : 'Hunt has concluded.',
        'warn',
      );
      return;
    }
    setCheckInLoading(true);
    try {
      await api.reachLocation(level.id, pos.latitude, pos.longitude);
      if (useVoiceStore.getState().muted) {
        playClueUnlockedSound();
      } else {
        announceClueDecrypted(currentStep, level.isFinal);
      }
      triggerHaptic();
      const updated = await api.getParticipantGame();
      setProgress(updated.progress);
      if (typeof updated.totalSteps === 'number' && updated.totalSteps > 0) setTotalSteps(updated.totalSteps);
      setShowClueModal(true);
      setIsSheetExpanded(true);
    } catch (err: any) {
      toast(err.message ?? 'Proximity verification failed. Move closer to the landmark!', 'error');
    } finally {
      setCheckInLoading(false);
    }
  }

  // Auto trigger when player steps inside geofence radius
  useEffect(() => {
    if (
      !locationReached &&
      !isVerifiedFinished &&
      distanceMeters !== null &&
      distanceMeters <= triggerRadius + 5 &&
      pos &&
      !checkInLoading
    ) {
      triggerCheckIn();
    }
  }, [distanceMeters, locationReached, isVerifiedFinished, triggerRadius, pos]);

  // Submit Answer Solution
  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!currentLevel || !level) return;
    if (game?.status !== 'running') {
      setAnswerError(
        game?.status === 'paused'
          ? 'Hunt is temporarily PAUSED by Event Control.'
          : 'Hunt has officially concluded.',
      );
      return;
    }
    setAnswerError('');
    setAnswerLoading(true);
    try {
      const res = await api.submitAnswer(level.id, answer.trim());
      if (res.correct) {
        setAnswer('');
        if (useVoiceStore.getState().muted) {
          playSuccessSound();
        } else {
          announceStageAdvance(
            res.stepNumber,
            Boolean(res.isFinal || (res.stepNumber && res.stepNumber >= (res.totalSteps ?? totalSteps))),
          );
        }
        triggerHaptic([80, 50, 120]);
        toast(
          res.finished ? 'Passphrase verified — finish locked!' : 'Passcode verified — advancing to next stage!',
          'success',
        );
        const data = await api.getParticipantGame();
        setProgress(data.progress);
        if (typeof data.totalSteps === 'number' && data.totalSteps > 0) setTotalSteps(data.totalSteps);
        if (res.finished) {
          triggerHaptic([200, 100, 200, 100, 500]);
        }
      }
    } catch (err: any) {
      setAnswerError(err.message ?? 'Verification rejected: incorrect solution');
      playErrorSound();
      triggerHaptic([250, 100, 250]);
    } finally {
      setAnswerLoading(false);
    }
  }

  // Reveal Hint with custom in-app confirmation
  async function useHint(hint: { id: number; orderIndex: number; penaltyMins: number }) {
    if (!currentLevel || !level || revealedHintIds.has(hint.id)) return;
    if (game?.status !== 'running') {
      toast(
        game?.status === 'paused' ? 'Hunt is temporarily PAUSED by Event Control.' : 'Hunt has concluded.',
        'warn',
      );
      return;
    }
    const freeHint = currentLevel.hintsUsed < (currentLevel.hintReveals.length - revealedHintIds.size + 1);
    const penalty = freeHint ? 0 : hint.penaltyMins;
    const confirmed = await uiConfirm({
      title: `Reveal Tactical Intel #${hint.orderIndex}?`,
      message:
        penalty > 0
          ? `Decrypting this hint incurs a +${penalty} minute penalty added to your official finish time.`
          : 'No penalty applies for this unlocked hint.',
      confirmLabel: penalty > 0 ? `Reveal (+${penalty}m)` : 'Reveal Hint',
      tone: penalty > 0 ? 'amber' : 'default',
    });
    if (!confirmed) return;

    setHintLoading(hint.orderIndex);
    try {
      const res = await api.revealHint(level.id, hint.orderIndex);
      setRevealedHints((prev) => ({ ...prev, [hint.id]: res.text }));
      const data = await api.getParticipantGame();
      setProgress(data.progress);
      toast(`Intel #${hint.orderIndex} decrypted.`, 'info');
    } catch (err: any) {
      toast(err.message ?? 'Could not reveal hint', 'error');
    } finally {
      setHintLoading(null);
    }
  }

  // Sign out with custom in-app confirmation
  async function handleLogout() {
    const confirmed = await uiConfirm({
      title: 'Sign Out Terminal?',
      message: `Disconnect squad "${teamName || 'Operative'}" from this device?`,
      confirmLabel: 'Sign Out',
      tone: 'danger',
    });
    if (!confirmed) return;
    stopPaVoice();
    sessionStorage.removeItem('ch-pa-intro-done');
    await api.logout().catch(() => {});
    clearAuth();
    setLatestPhoto(null);
    disconnectSocket();
    navigate('/login');
  }

  function renderVictoryPhotoSection() {
    const isRejected = photoStatus === 'rejected';
    const isApproved = photoStatus === 'approved';
    const isPending = photoStatus === 'pending';

    return (
      <div className="pt-2 flex flex-col items-center gap-2.5 border-t border-white/[0.06] w-full">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          {isRejected ? 'Verification Photo Rejected — Action Required' : 'Victory Photo Proof'}
        </span>

        {isRejected && (
          <div className="w-full bg-rose-950/60 border border-rose-500/45 rounded-xl p-3 text-left flex items-start gap-2.5">
            <AlertTriangleIcon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[11px] font-mono font-bold text-rose-300 uppercase tracking-wide">
                Photo Rejected by Event Control
              </span>
              <p className="text-xs text-rose-100/90 break-words leading-snug">
                {latestPhoto?.reviewNote?.trim()
                  ? `Reason: ${latestPhoto.reviewNote}`
                  : 'Coordinators rejected your submission. Please snap a clearer photo and resubmit.'}
              </p>
            </div>
          </div>
        )}

        <label
          className={`cursor-pointer py-2.5 px-4 rounded-xl active:scale-[0.98] font-mono font-bold text-xs transition-all flex items-center gap-2 min-h-[42px] border ${
            isRejected
              ? 'bg-rose-500 hover:bg-rose-400 border-rose-300 text-zinc-950 shadow-lg shadow-rose-500/20'
              : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-100'
          }`}
        >
          {isApproved ? (
            <CheckIcon className="w-4 h-4 text-emerald-400" />
          ) : (
            <CameraIcon className={`w-4 h-4 ${isRejected ? 'text-zinc-950' : 'text-cyan-300'}`} />
          )}
          <span>
            {photoUploading
              ? 'TRANSMITTING PHOTO…'
              : isRejected
              ? 'RE-TAKE & RESUBMIT PHOTO'
              : isApproved
              ? 'PHOTO APPROVED (TAP TO RE-TAKE)'
              : isPending
              ? 'PHOTO PENDING REVIEW (TAP TO RE-TAKE)'
              : 'SNAP & TRANSMIT PHOTO'}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={photoUploading}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setPhotoError('');
              setPhotoUploading(true);
              try {
                const fd = new FormData();
                fd.append('photo', file);
                const uploaded = await api.uploadPhoto(fd);
                setLatestPhoto({
                  id: uploaded.id,
                  status: uploaded.status ?? 'pending',
                  reviewNote: uploaded.reviewNote ?? null,
                  submittedAt: uploaded.submittedAt ?? new Date().toISOString(),
                  reviewedAt: uploaded.reviewedAt ?? null,
                });
                playSuccessSound();
                triggerHaptic();
                toast('Victory photo transmitted to Event Control!', 'success');
              } catch (err: any) {
                setPhotoError(err.message ?? 'Photo upload failed');
              } finally {
                setPhotoUploading(false);
                input.value = '';
              }
            }}
          />
        </label>

        {photoError && <p className="text-rose-400 text-xs font-mono">{photoError}</p>}

        {isPending && (
          <p className="text-amber-300 text-[11px] font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Transmitted — awaiting coordinator approval…</span>
          </p>
        )}
        {isApproved && (
          <p className="text-emerald-400 text-[11px] font-mono flex items-center gap-1">
            <CheckIcon className="w-3.5 h-3.5" />
            <span>Victory photo approved by Event Control!</span>
          </p>
        )}
      </div>
    );
  }

  // Map overlays
  const zones = game?.zones ?? [];
  let campusBounds: [[number, number], [number, number]] | null = null;
  if (game?.campusMapBounds) {
    try {
      campusBounds = JSON.parse(game.campusMapBounds);
    } catch {}
  }

  const totalLevels = Math.max(progress.length, totalSteps);

  return (
    <div className="relative w-full h-[100dvh] bg-[#07080b] text-zinc-100 font-sans overflow-hidden select-none">
      {/* Precision Signal Indicator Bar (when socket disconnected) */}
      {!connected && (
        <div className="absolute top-0 inset-x-0 z-[1100] bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-center text-[10px] py-1 px-4 font-mono font-medium flex items-center justify-center gap-2 backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="uppercase tracking-wider">Telemetry Stream Reconnecting…</span>
        </div>
      )}

      <AnnouncementBanner />
      <PaVoiceBanner teamName={teamName} />
      <ZoneWarning />

      {/* =========================================================================
          TOP AERONAUTICS HUD BAR (FLOATING OVER MAP)
          ========================================================================= */}
      <div className="absolute top-3 inset-x-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: Squad Profile & Call-Sign Pill */}
        <button
          onClick={() => setShowProfileModal(true)}
          className="pointer-events-auto obsidian-surface hover:border-white/20 px-3 py-1.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shrink-0"
          title="Squad Operative Dossier"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold leading-tight tabular-nums">
              SQUAD #{teamId ?? '01'}
            </span>
            <span className="text-xs font-mono font-black text-white tracking-tight truncate max-w-[110px]">
              {teamName || 'OPERATIVE'}
            </span>
          </div>
        </button>

        {/* Center: Safe gap for notch / selfie camera punch-holes */}
        <div className="flex-1" />

        {/* Right: Tactical Tools + Mission Stopwatch */}
        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {game?.startedAt && (
            <div className="obsidian-surface px-2.5 py-1.5 rounded-2xl flex items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${game.status === 'paused' ? 'bg-amber-400' : isVerifiedFinished ? 'bg-cyan-400' : 'bg-emerald-400 animate-pulse'}`} />
                <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider font-bold hidden sm:inline">
                  {game.status === 'paused' ? 'PAUSED' : 'TIME'}
                </span>
                <span className="text-xs font-mono font-black tabular-nums tracking-tight text-white">
                  {elapsedFormatted}
                </span>
              </div>
              {totalHintPenaltiesMins > 0 && (
                <span
                  className="text-[9px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-1 py-0.5 rounded-md font-bold tabular-nums"
                  title="Hint Penalty Time added to finish score"
                >
                  +{totalHintPenaltiesMins}m
                </span>
              )}
            </div>
          )}

          {/* PA Voice Comms Mute/Unmute Toggle */}
          <button
            onClick={() => {
              if (voiceMuted) {
                toggleVoiceMute();
                primeSpeechEngine();
                toast('Arena PA Voice Announcements enabled.', 'info');
              } else {
                stopPaVoice();
                toggleVoiceMute();
                toast('Arena PA Voice muted.', 'info');
              }
            }}
            className={`w-8 h-8 rounded-2xl obsidian-surface flex items-center justify-center active:scale-95 transition-all ${
              voiceMuted
                ? 'text-zinc-500 hover:text-zinc-300'
                : 'text-rose-400 border-rose-500/35 hover:border-rose-400/60'
            }`}
            title={voiceMuted ? 'Enable Arena PA Voice' : 'Mute Arena PA Voice'}
            aria-label={voiceMuted ? 'Unmute PA voice announcements' : 'Mute PA voice announcements'}
          >
            {voiceMuted ? <VolumeOffIcon className="w-4 h-4" /> : <VolumeOnIcon className="w-4 h-4" />}
          </button>

          {/* GPS Calibration & Sensor Diagnostic Tool */}
          <button
            onClick={() => setShowGpsModal(true)}
            className="w-8 h-8 rounded-2xl obsidian-surface hover:border-cyan-400/50 flex items-center justify-center text-cyan-300 active:scale-95 transition-all"
            title="Calibrate GPS Sensor & Diagnostics"
            aria-label="Calibrate GPS Sensor"
          >
            <SatelliteIcon className="w-4 h-4" />
          </button>

          {/* Satellite Layer Switcher */}
          <div className="obsidian-surface px-2 py-1.5 rounded-2xl">
            <select
              value={selectedSourceKey}
              onChange={(e) => setSelectedSourceKey(e.target.value)}
              aria-label="Satellite Map Source"
              className="bg-transparent text-[10px] font-mono text-zinc-200 border-none outline-none cursor-pointer"
            >
              <option value="google" className="bg-zinc-900 text-white">Google Sat</option>
              <option value="google_hybrid" className="bg-zinc-900 text-white">Sat + Roads</option>
              <option value="esri" className="bg-zinc-900 text-white">Esri Sat</option>
            </select>
          </div>

          {/* Re-Center GPS Button */}
          <button
            onClick={refreshLocation}
            className="w-8 h-8 rounded-2xl obsidian-surface hover:border-white/25 flex items-center justify-center text-cyan-300 active:scale-95 transition-all"
            title="Recalibrate GPS position"
            aria-label="Recenter GPS Position"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="1" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="1" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="23" y2="12" />
            </svg>
          </button>

          {/* Fullscreen Mode Button */}
          {!fullscreenActive && (
            <button
              onClick={() => toggleFullscreen()}
              className="w-8 h-8 rounded-2xl obsidian-surface hover:border-white/25 flex items-center justify-center text-zinc-300 active:scale-95 transition-all"
              title="Fullscreen HUD"
              aria-label="Enter Fullscreen HUD"
            >
              <MaximizeIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* TACTICAL PAUSE / CONCLUSION BANNER FOR SQUADS */}
      {game?.status === 'paused' && (
        <div className="absolute inset-x-3 top-16 z-[960] max-w-sm mx-auto bg-amber-950/95 border border-amber-500/60 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 animate-slide-down">
          <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
            <PauseIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-mono font-black text-amber-300 uppercase tracking-wider block">
              Timers Paused by Command Desk
            </span>
            <p className="text-[10px] font-mono text-amber-200/90 leading-tight mt-0.5">
              Mission operations temporarily frozen. Stand by at your current landmark.
            </p>
          </div>
        </div>
      )}

      {game?.status === 'ended' && (
        <div className="absolute inset-x-3 top-16 z-[960] max-w-sm mx-auto bg-[#0c0e14]/95 border border-emerald-500/50 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 animate-slide-down">
          <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
            <FlagIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-mono font-black text-emerald-300 uppercase tracking-wider block">
              Campus Hunt Concluded
            </span>
            <p className="text-[10px] font-mono text-zinc-300 leading-tight mt-0.5">
              All timings locked. Report to the Start Venue for final rankings & ceremony.
            </p>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULLSCREEN SATELLITE MAP (CORE VIEWPORT)
          ========================================================================= */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <MapContainer
          center={SDMCET_CENTER}
          zoom={18}
          minZoom={15}
          maxZoom={20}
          maxBounds={SDMCET_MAX_BOUNDS}
          maxBoundsViscosity={0.7}
          className="h-full w-full"
          zoomControl={false}
        >
          <MapResizer />

          {/* Satellite Tile Provider */}
          <TileLayer
            key={activeSource.id}
            attribution={activeSource.attribution}
            url={activeSource.url}
            className="satellite-tiles"
            maxZoom={activeSource.maxZoom}
          />

          {/* SDMCET Campus Boundary Polygon */}
          <Polygon
            positions={SDMCET_CAMPUS_POLYGON}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#38bdf8',
              fillOpacity: 0.04,
              weight: 2,
              dashArray: '4 4',
            }}
          />

          {/* Campus Map Blueprint Overlay if present */}
          {game?.campusMapUrl && campusBounds && (
            <ImageOverlay url={game.campusMapUrl} bounds={campusBounds} opacity={0.8} />
          )}

          {/* Campus Restricted & Permitted Zones */}
          {zones.map((zone: any) => {
            if (!zone.active) return null;
            try {
              const geo = JSON.parse(zone.geoJson);
              const coords: [number, number][] = geo.coordinates[0].map(([lng, lat]: number[]) => [lat, lng]);
              return (
                <Polygon
                  key={zone.id}
                  positions={coords}
                  pathOptions={{
                    color: zone.kind === 'restricted' ? '#ef4444' : '#10b981',
                    fillColor: zone.kind === 'restricted' ? '#ef4444' : '#10b981',
                    fillOpacity: zone.kind === 'restricted' ? 0.35 : 0.08,
                    weight: 1.5,
                    dashArray: zone.kind === 'restricted' ? '4 4' : undefined,
                  }}
                />
              );
            } catch {
              return null;
            }
          })}

          {/* Target Landmark: Revealed when location reached or discovered */}
          {locationReached && targetLat != null && targetLng != null && (
            <>
              <Circle
                center={[targetLat, targetLng]}
                radius={triggerRadius}
                pathOptions={{
                  color: '#10b981',
                  fillColor: '#10b981',
                  fillOpacity: 0.18,
                  weight: 2,
                }}
              />
              <Marker position={[targetLat, targetLng]} icon={targetIcon} />
            </>
          )}

          {/* Player Live GPS Dot */}
          {pos && (
            <>
              <Circle
                center={[pos.latitude, pos.longitude]}
                radius={Math.min(pos.accuracy, 25)}
                pathOptions={{
                  color: '#38bdf8',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.12,
                  weight: 1,
                }}
              />
              <Marker position={[pos.latitude, pos.longitude]} icon={playerIcon} />
              <CenterController pos={pos} />
            </>
          )}
        </MapContainer>
      </div>

      {/* =========================================================================
          DOCKED BOTTOM HUD STACK (RADAR + MISSION SHEET, ZERO OVERLAP)
          ========================================================================= */}
      <div className="absolute inset-x-0 bottom-0 z-[950] flex flex-col items-center pointer-events-none gap-2.5 max-h-[84dvh]">
        {/* Floating Radar Card (directly docked above Mission Sheet) */}
        {currentLevel && !isVerifiedFinished && (
          <div className="pointer-events-auto w-[calc(100%-1.5rem)] max-w-md px-0.5">
            <div className="obsidian-surface rounded-3xl p-3.5 sm:p-4">
              <DistanceRadar
                distanceMeters={distanceMeters}
                triggerRadius={triggerRadius}
                locationReached={locationReached}
                bearing={bearingDegrees}
                accuracy={pos?.accuracy}
                gpsHeading={pos?.heading}
                onTriggerCheckIn={triggerCheckIn}
                isLoading={checkInLoading}
              />
            </div>
          </div>
        )}

        {/* Minimizable Mission Action Sheet */}
        <div
          className={`pointer-events-auto w-full max-w-md bg-[#0c0e14]/95 backdrop-blur-2xl border-t border-x border-white/[0.09] transition-[max-height] duration-300 ease-out flex flex-col rounded-t-3xl shadow-[0_-16px_48px_rgba(0,0,0,0.65)] overflow-hidden ${
            isSheetExpanded ? 'max-h-[48dvh]' : 'max-h-16'
          }`}
        >
          {/* Sheet Top Handle & Toggle Bar */}
          <button
            type="button"
            onClick={() => setIsSheetExpanded((prev) => !prev)}
            className="w-full py-2.5 px-5 flex items-center justify-between cursor-pointer border-b border-white/[0.07] shrink-0 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors select-none text-left min-h-[56px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold shrink-0">
                {isVerifiedFinished
                  ? 'COMPLETE'
                  : isFinalStep
                  ? 'FINAL LOCATION'
                  : `STAGE ${String(currentStep).padStart(2, '0')} / ${totalSteps}`}
              </span>
              <span className="text-xs font-mono font-bold text-white truncate max-w-[175px]">
                {isVerifiedFinished
                  ? 'Verified Podium Finish'
                  : level?.title ?? (game?.status === 'idle' ? 'Standby for Kickoff' : 'Intelligence Directive')}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {photoStatus === 'rejected' && (
                <span className="text-[9px] font-mono tracking-wider uppercase bg-rose-500/15 border border-rose-500/45 text-rose-300 px-2 py-0.5 rounded-md font-bold animate-pulse">
                  PHOTO REJECTED
                </span>
              )}
              {isVerifiedFinished ? (
                <span className="text-[9px] font-mono tracking-wider uppercase bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                  FINISHED
                </span>
              ) : currentLevel ? (
                locationReached ? (
                  <span className="text-[9px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                    DECRYPTED
                  </span>
                ) : (
                  <span className="text-[9px] font-mono tracking-wider uppercase bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-md font-bold">
                    LOCKED
                  </span>
                )
              ) : null}

              <span
                className="text-zinc-400 hover:text-white p-1 rounded transition-transform duration-200"
                style={{ transform: isSheetExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronUpIcon className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* Sheet Scrollable Body */}
          {isSheetExpanded && (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 safe-bottom flex flex-col gap-4 animate-fade-in">
              {/* Verified Finish Celebration State */}
              {isVerifiedFinished ? (
                <div className="py-2 flex flex-col items-center text-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-500/10">
                    <TrophyIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                      HUNT ACCOMPLISHED // VERIFIED
                    </span>
                    <h3 className="text-xl font-black text-white tracking-tight mt-0.5">
                      {myRanking?.rank ? `Current Standing: #${myRanking.rank}` : 'Finish Confirmed'}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
                      Coordinators verified your finale sprint. Standby at the main stage for official podium ceremony.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 w-full font-mono">
                    <div className="bg-zinc-900/70 border border-white/[0.06] rounded-2xl p-3">
                      <span className="text-[9px] text-zinc-500 uppercase block">Official Time</span>
                      <span className="text-sm font-black text-emerald-400 tabular-nums mt-0.5 block">
                        {myRanking?.adjustedTimeSecs != null
                          ? formatMs(myRanking.adjustedTimeSecs * 1000)
                          : elapsedFormatted}
                      </span>
                    </div>
                    <div className="bg-zinc-900/70 border border-white/[0.06] rounded-2xl p-3">
                      <span className="text-[9px] text-zinc-500 uppercase block">Hints Penalty</span>
                      <span className="text-sm font-black text-amber-300 tabular-nums mt-0.5 block">
                        +{totalHintPenaltiesMins}m
                      </span>
                    </div>
                  </div>

                  {latestPhoto && renderVictoryPhotoSection()}
                </div>
              ) : !currentLevel ? (
                /* Standby State before Kickoff */
                <div className="py-3 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-400/30 flex items-center justify-center text-cyan-400 animate-pulse shadow-lg">
                    <RadarIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                      STANDBY // MISSION READY
                    </span>
                    <h3 className="text-base font-black text-white mt-1">Awaiting Event Kickoff</h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed font-sans">
                      Squad <strong className="text-zinc-200">{teamName}</strong> is registered. When coordinators start the hunt, your unique starting landmark will unlock automatically.
                    </p>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 px-3.5 py-1.5 rounded-xl border border-white/[0.08] flex items-center gap-2 tabular-nums">
                    <span className={`w-2 h-2 rounded-full ${pos ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span>{pos ? `GPS Calibrated (±${Math.round(pos.accuracy)}m)` : 'Acquiring GPS fix…'}</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* 1. Clue Intel Box */}
                  {locationReached ? (
                    <div className="bg-zinc-900/70 border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                        CLASSIFIED FIELD BRIEFING
                      </span>
                      <p className="text-xs sm:text-sm text-zinc-100 font-normal leading-relaxed">
                        {level?.clueText}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-4 text-center flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-amber-400">
                        <LockIcon className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                        GEOFENCE ENCRYPTION ACTIVE
                      </h3>
                      <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xs">
                        Physical proximity verification required. Move within {triggerRadius}m of the landmark to decrypt intelligence.
                      </p>
                    </div>
                  )}

                  {/* 2. Campus Navigation Guidance */}
                  {level?.locationHint && (
                    <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-3.5 flex flex-col gap-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                        CAMPUS SECTOR GUIDANCE
                      </span>
                      <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                        {level.locationHint}
                      </p>
                    </div>
                  )}

                  {/* 3. External Dossier Links & Teammate QR Scanner */}
                  {level && level.socialLinks.length > 0 && locationReached && (
                    <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-300 font-bold flex items-center gap-1.5">
                          <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
                          <span>EXTERNAL DOSSIER INTEL</span>
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold tabular-nums">
                          {level.socialLinks.length} {level.socialLinks.length === 1 ? 'LINK' : 'LINKS'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-3">
                        {level.socialLinks.map((sl, i) => (
                          <div key={i} className="flex flex-col gap-2.5 p-3.5 bg-zinc-950/70 border border-white/[0.07] rounded-xl">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-1.5">
                                <GlobeIcon className="w-3.5 h-3.5 text-zinc-400" />
                                <span>{sl.platform}</span>
                              </span>
                              <a
                                href={sl.url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-cyan-300 text-[11px] font-mono uppercase transition-all flex items-center gap-1"
                              >
                                <span>Open</span>
                                <span className="text-[10px]">↗</span>
                              </a>
                            </div>

                            <QrCodeDisplay
                              url={sl.url}
                              label={`SCAN FOR ${sl.platform.toUpperCase()}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Tactical Assistance Hints */}
                  {!isCompleted && level && level.hints.length > 0 && locationReached && (
                    <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                          TACTICAL ASSISTANCE DECRYPTS
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold tabular-nums">
                          {currentLevel?.hintsUsed ?? 0}/3 USED
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {level.hints.map((hint) => {
                          const revealed = revealedHintIds.has(hint.id) || revealedHints[hint.id];
                          const text = revealedHints[hint.id];

                          return (
                            <div key={hint.id} className="bg-[#07080b] rounded-xl p-3 border border-white/[0.07]">
                              {revealed && text ? (
                                <p className="text-xs text-amber-300 font-mono leading-relaxed">{text}</p>
                              ) : revealed ? (
                                <p className="text-xs text-zinc-400 font-mono italic">Hint decrypted.</p>
                              ) : (
                                <button
                                  onClick={() => useHint(hint)}
                                  disabled={hintLoading === hint.orderIndex || (currentLevel?.hintsUsed ?? 0) >= 3}
                                  className="w-full text-left text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 font-semibold flex items-center justify-between min-h-[38px]"
                                >
                                  <span className="font-mono text-xs">
                                    {hintLoading === hint.orderIndex ? 'DECRYPTING…' : `REVEAL INTEL #${hint.orderIndex}`}
                                  </span>
                                  <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-amber-300 tabular-nums">
                                    +{hint.penaltyMins}M PENALTY
                                  </span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 5. Mission Solution Decoder Form OR Finale Rendezvous */}
                  {level?.isFinal ? (
                    <div className="bg-zinc-900/80 border border-emerald-500/45 rounded-2xl p-4 text-center flex flex-col gap-3 shadow-xl">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                        <FlagIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                          FINAL LOCATION // SPORTS COMPLEX
                        </h3>
                        <p className="text-xs text-zinc-300 leading-relaxed mt-1.5 max-w-xs mx-auto">
                          1. Scan Wi-Fi for <strong className="text-cyan-300">WHO_AM_I_NODE</strong> near courts.<br />
                          2. Locate Target Volunteer with <strong className="text-rose-300">red clipboard</strong> on bleachers.<br />
                          3. Speak exact passphrase aloud &amp; verify below to stop the clock!
                        </p>
                      </div>

                      {!isCompleted && Boolean(level.answer?.trim()) && (
                        <form onSubmit={submitAnswer} className="flex flex-col gap-2 pt-1 text-left">
                          <input
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="ENTER FINAL PASSPHRASE…"
                            className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-emerald-500/35 text-white placeholder-zinc-500 font-mono text-sm tracking-wider focus:outline-none focus:border-emerald-400 transition-all"
                          />
                          {answerError && (
                            <p className="text-rose-400 text-xs font-mono font-semibold px-1">{answerError}</p>
                          )}
                          <button
                            type="submit"
                            disabled={answerLoading || !answer.trim()}
                            className="w-full py-3 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 active:scale-[0.98] text-zinc-950 font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all min-h-[46px]"
                          >
                            {answerLoading ? 'VERIFYING PASSPHRASE…' : 'SUBMIT PASSPHRASE & FINISH →'}
                          </button>
                        </form>
                      )}

                      {renderVictoryPhotoSection()}
                    </div>
                  ) : !isCompleted && level ? (
                    <form onSubmit={submitAnswer} className="flex flex-col gap-2 pt-1 pb-2">
                      <input
                        type="text"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="ENTER DECODED SOLUTION…"
                        className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/15 text-white placeholder-zinc-500 font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-cyan-400 transition-all"
                      />

                      {answerError && (
                        <p className="text-rose-400 text-xs font-mono font-semibold px-1">{answerError}</p>
                      )}

                      <button
                        type="submit"
                        disabled={answerLoading || !answer.trim()}
                        className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 active:scale-[0.98] text-zinc-950 font-black text-xs uppercase tracking-widest shadow-xl transition-all min-h-[46px]"
                      >
                        {answerLoading ? 'VERIFYING SOLUTION…' : 'TRANSMIT DECODED SOLUTION →'}
                      </button>
                    </form>
                  ) : (
                    <div className="text-center text-emerald-300 text-xs font-mono font-bold py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-2 flex items-center justify-center gap-1.5">
                      <CheckIcon className="w-4 h-4" />
                      <span>STAGE ACCOMPLISHED. ADVANCE TO NEXT OBJECTIVE.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SQUAD OPERATIVE DOSSIER MODAL
          ========================================================================= */}
      {showProfileModal && (
        <div
          onClick={() => setShowProfileModal(false)}
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="obsidian-surface rounded-3xl p-6 max-w-sm w-full flex flex-col gap-5 animate-scale-in"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  SQUAD DOSSIER
                </span>
                <h2 className="text-lg font-black text-white tracking-tight">{teamName}</h2>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                aria-label="Close squad dossier"
                className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Tactical Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3.5 text-center">
                <p className="text-2xl font-black font-mono text-white tabular-nums">
                  {completedCount}/{totalLevels}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 mt-0.5">
                  STAGES CLEARED
                </p>
              </div>

              <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3.5 text-center">
                <p className="text-2xl font-black font-mono text-amber-400 tabular-nums">
                  {progress.reduce((s, p) => s + p.hintsUsed, 0)}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 mt-0.5">
                  HINTS USED
                </p>
              </div>
            </div>

            {/* Diagnostics */}
            <div className="bg-[#07080b] border border-white/[0.07] rounded-2xl p-3.5 flex flex-col gap-2.5 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-300">
                <span>GPS Sensor</span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold tabular-nums">
                    {pos ? `ONLINE (±${Math.round(pos.accuracy)}m)` : 'SEARCHING…'}
                  </span>
                  <button
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowGpsModal(true);
                    }}
                    className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 text-[10px] font-bold hover:bg-cyan-900 transition-colors"
                  >
                    CALIBRATE
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Telemetry Stream</span>
                <span className={connected ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300 pt-1.5 border-t border-white/[0.06]">
                <span className="flex items-center gap-1.5">
                  <SquidSymbolsIcon className="w-5 h-2.5 text-rose-400" />
                  <span>Arena PA Voice</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceMuted) toggleVoiceMute();
                      primeSpeechEngine();
                      setShowProfileModal(false);
                      announceArenaWelcome(teamName);
                    }}
                    className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-bold hover:bg-rose-900/70 transition-colors"
                  >
                    REPLAY INTRO
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceMuted) {
                        toggleVoiceMute();
                        primeSpeechEngine();
                      } else {
                        stopPaVoice();
                        toggleVoiceMute();
                      }
                    }}
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold transition-colors ${
                      voiceMuted
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    {voiceMuted ? 'MUTED' : 'ON'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/40 text-xs font-mono font-bold transition-all min-h-[42px]"
            >
              SIGN OUT OF FIELD TERMINAL
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          GPS CALIBRATION & SENSOR DIAGNOSTIC MODAL
          ========================================================================= */}
      <GpsCalibrationModal
        isOpen={showGpsModal}
        onClose={() => setShowGpsModal(false)}
        pos={pos}
        refreshLocation={refreshLocation}
      />

      {/* =========================================================================
          CELEBRATION CLUE DROP MODAL
          ========================================================================= */}
      {showClueModal && level && (
        <ClueDropModal
          levelTitle={level.title}
          orderIndex={currentStep}
          clueText={level.clueText}
          locationHint={level.locationHint}
          onClose={() => setShowClueModal(false)}
        />
      )}
    </div>
  );
}
