import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Circle, Marker, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useLocation } from '../../hooks/useLocation';
import { useCountdown, useStopwatch, formatMs } from '../../hooks/useCountdown';
import { api } from '../../lib/api';
import { disconnectSocket } from '../../lib/socket';
import { computeDistanceMeters, computeBearingDegrees } from '../../lib/geo';
import { playClueUnlockedSound, triggerHaptic } from '../../lib/sound';
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
import { LockIcon, UnlockIcon, RadarIcon } from '../../components/Icons';

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
  const setProgress = useGameStore((s) => s.setProgress);
  const connected = useGameStore((s) => s.connected);

  const teamName = useAuthStore((s) => s.teamName);
  const teamId = useAuthStore((s) => s.teamId);
  const clearAuth = useAuthStore((s) => s.clear);

  // Device & Location Hooks
  const { pos, refreshLocation } = useLocation();

  // Local UI States
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(true);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showClueModal, setShowClueModal] = useState<boolean>(false);

  // Mission Action States
  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [answerLoading, setAnswerLoading] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [hintLoading, setHintLoading] = useState<number | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [photoError, setPhotoError] = useState('');

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
  const isFinalStep = Boolean(level?.isFinal || currentStep >= 10);

  const revealedHintIds = useMemo(
    () => new Set(currentLevel?.hintReveals.map((r) => r.hintId) ?? []),
    [currentLevel?.hintReveals],
  );

  // Fullscreen tracking & auto-engage
  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    const updateFs = () => setFullscreenActive(isFullscreen());
    updateFs();
    document.addEventListener('fullscreenchange', updateFs);
    document.addEventListener('webkitfullscreenchange', updateFs);
    return () => {
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
  const { elapsedMs, formatted: elapsedFormatted } = useStopwatch(
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
      alert(game?.status === 'paused' ? 'Hunt is temporarily PAUSED by Event Control.' : 'Hunt has concluded.');
      return;
    }
    setCheckInLoading(true);
    try {
      await api.reachLocation(level.id, pos.latitude, pos.longitude);
      playClueUnlockedSound();
      triggerHaptic();
      const updated = await api.getParticipantGame();
      setProgress(updated.progress);
      setShowClueModal(true);
      setIsSheetExpanded(true); // Open sheet to show decrypted clue
    } catch (err: any) {
      alert(err.message ?? 'Proximity verification failed. Move closer to the landmark!');
    } finally {
      setCheckInLoading(false);
    }
  }

  // Auto trigger when player steps inside geofence radius
  useEffect(() => {
    if (
      !locationReached &&
      distanceMeters !== null &&
      distanceMeters <= triggerRadius + 5 &&
      pos &&
      !checkInLoading
    ) {
      triggerCheckIn();
    }
  }, [distanceMeters, locationReached, triggerRadius, pos]);

  // Submit Answer Solution
  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!currentLevel || !level) return;
    if (game?.status !== 'running') {
      setAnswerError(game?.status === 'paused' ? 'Hunt is temporarily PAUSED by Event Control.' : 'Hunt has officially concluded.');
      return;
    }
    setAnswerError('');
    setAnswerLoading(true);
    try {
      const res = await api.submitAnswer(level.id, answer.trim());
      if (res.correct) {
        setAnswer('');
        const data = await api.getParticipantGame();
        setProgress(data.progress);
      }
    } catch (err: any) {
      setAnswerError(err.message ?? 'Verification rejected: incorrect solution');
      if ('vibrate' in navigator) navigator.vibrate(200);
    } finally {
      setAnswerLoading(false);
    }
  }

  // Reveal Hint
  async function useHint(hint: { id: number; orderIndex: number; penaltyMins: number }) {
    if (!currentLevel || !level || revealedHintIds.has(hint.id)) return;
    if (game?.status !== 'running') {
      alert(game?.status === 'paused' ? 'Hunt is temporarily PAUSED by Event Control.' : 'Hunt has concluded.');
      return;
    }
    const freeHint = currentLevel.hintsUsed < (currentLevel.hintReveals.length - revealedHintIds.size + 1);
    const penalty = freeHint ? 0 : hint.penaltyMins;
    const msg =
      penalty > 0
        ? `REVEAL HINT #${hint.orderIndex}?\nIncurs a +${penalty} minute penalty to official team finish time.`
        : `REVEAL HINT #${hint.orderIndex}?`;
    if (!confirm(msg)) return;

    setHintLoading(hint.orderIndex);
    try {
      const res = await api.revealHint(level.id, hint.orderIndex);
      setRevealedHints((prev) => ({ ...prev, [hint.id]: res.text }));
      const data = await api.getParticipantGame();
      setProgress(data.progress);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setHintLoading(null);
    }
  }

  // Sign out
  async function handleLogout() {
    if (!confirm('Sign out from this operative terminal?')) return;
    await api.logout().catch(() => {});
    clearAuth();
    disconnectSocket();
    navigate('/login');
  }

  // Map overlays
  const zones = game?.zones ?? [];
  let campusBounds: [[number, number], [number, number]] | null = null;
  if (game?.campusMapBounds) {
    try {
      campusBounds = JSON.parse(game.campusMapBounds);
    } catch {}
  }

  const totalLevels = Math.max(progress.length, 10);

  return (
    <div className="relative w-full h-full min-h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      {/* Precision Signal Indicator Bar (when socket disconnected) */}
      {!connected && (
        <div className="absolute top-0 inset-x-0 z-[1100] bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-center text-[10px] py-1 px-4 font-mono font-medium flex items-center justify-center gap-2 backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="uppercase tracking-wider">Telemetry Stream Reconnecting…</span>
        </div>
      )}

      <AnnouncementBanner />
      <ZoneWarning />

      {/* =========================================================================
          TOP AERONAUTICS HUD BAR (FLOATING OVER MAP)
          ========================================================================= */}
      <div className="absolute top-3 inset-x-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
        {/* Left: Squad Profile & Call-Sign Pill */}
        <button
          onClick={() => setShowProfileModal(true)}
          className="pointer-events-auto bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 px-3 py-1.5 rounded-2xl shadow-2xl flex items-center gap-2 active:scale-95 transition-all"
          title="Squad Operative Dossier"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold leading-tight">
              SQUAD #{teamId ?? '01'}
            </span>
            <span className="text-xs font-mono font-black text-white tracking-tight truncate max-w-[120px]">
              {teamName || 'OPERATIVE'}
            </span>
          </div>
        </button>

        {/* Center: Mission Stopwatch (Counts UP from 00:00:00) */}
        {game?.startedAt && (
          <div className="pointer-events-auto bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 px-3 py-1.5 rounded-2xl shadow-2xl flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${game.status === 'paused' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
                {game.status === 'paused' ? 'PAUSED' : 'TIME'}
              </span>
              <span className="text-xs font-mono font-black tabular-nums tracking-tight text-white">
                {elapsedFormatted}
              </span>
            </div>
            {totalHintPenaltiesMins > 0 && (
              <span
                className="text-[9px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-md font-bold"
                title="Hint Penalty Time added to finish score"
              >
                +{totalHintPenaltiesMins}m
              </span>
            )}
          </div>
        )}

        {/* Right: Tactical Tools (Sat Switcher, GPS Center, Fullscreen) */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {/* Satellite Layer Switcher */}
          <div className="bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 px-2 py-1.5 rounded-2xl shadow-2xl">
            <select
              value={selectedSourceKey}
              onChange={(e) => setSelectedSourceKey(e.target.value)}
              className="bg-transparent text-[10px] font-mono text-zinc-300 border-none outline-none cursor-pointer"
            >
              <option value="google" className="bg-zinc-900 text-white">Google Sat</option>
              <option value="google_hybrid" className="bg-zinc-900 text-white">Sat + Roads</option>
              <option value="esri" className="bg-zinc-900 text-white">Esri Sat</option>
            </select>
          </div>

          {/* Re-Center GPS Button */}
          <button
            onClick={refreshLocation}
            className="w-8 h-8 rounded-2xl bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-cyan-300 active:scale-95 transition-all shadow-2xl"
            title="Recalibrate GPS position"
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
              className="w-8 h-8 rounded-2xl bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-300 active:scale-95 transition-all shadow-2xl"
              title="Fullscreen HUD"
            >
              <span className="text-xs">⛶</span>
            </button>
          )}
        </div>
      </div>

      {/* TACTICAL PAUSE / CONCLUSION MISSION OVERLAY FOR SQUADS */}
      {game?.status === 'paused' && (
        <div className="absolute inset-x-3 top-16 z-[960] max-w-sm mx-auto bg-amber-950/95 border-2 border-amber-500 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 animate-pulse">
          <span className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
            ⏸
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black text-amber-300 uppercase tracking-wider">
                Timers Paused by Command Desk
              </span>
            </div>
            <p className="text-[10px] font-mono text-amber-200/90 leading-tight mt-0.5">
              Mission operations temporarily frozen. Stand by at your current landmark.
            </p>
          </div>
        </div>
      )}

      {game?.status === 'ended' && (
        <div className="absolute inset-x-3 top-16 z-[960] max-w-sm mx-auto bg-zinc-950/95 border-2 border-emerald-500 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-lg shrink-0">
            🏁
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black text-emerald-300 uppercase tracking-wider">
                Campus Hunt Concluded
              </span>
            </div>
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
          FLOATING RADAR & DYNAMIC MOVING DIRECTION ARROW (ABOVE BOTTOM SHEET)
          ========================================================================= */}
      {currentLevel && (
        <div
          className={`absolute inset-x-3 z-[900] transition-all duration-300 pointer-events-auto max-w-md mx-auto ${
            isSheetExpanded ? 'bottom-[42%] md:bottom-[46%]' : 'bottom-20'
          }`}
        >
          <div className="bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 rounded-3xl p-4 shadow-2xl">
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

      {/* =========================================================================
          FLOATING MINIMIZABLE BOTTOM ACTION SHEET (INTEL, HINTS, SOLUTION DECODER)
          ========================================================================= */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[950] bg-zinc-950/95 backdrop-blur-2xl border-t border-zinc-800 transition-all duration-300 flex flex-col max-w-md mx-auto rounded-t-3xl shadow-2xl overflow-hidden ${
          isSheetExpanded ? 'h-[40%] md:h-[44%]' : 'h-16'
        }`}
      >
        {/* Sheet Top Handle & Toggle Bar */}
        <div
          onClick={() => setIsSheetExpanded((prev) => !prev)}
          className="w-full py-2.5 px-5 flex items-center justify-between cursor-pointer border-b border-zinc-800/80 shrink-0 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
              {isFinalStep ? 'FINALE 🏁' : `STAGE 0${currentStep} / 10`}
            </span>
            <span className="text-xs font-mono font-bold text-white truncate max-w-[180px]">
              {level?.title ?? (game?.status === 'idle' ? 'Standby for Kickoff' : 'Intelligence Directive')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {locationReached ? (
              <span className="text-[9px] font-mono tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-md font-bold">
                DECRYPTED
              </span>
            ) : (
              <span className="text-[9px] font-mono tracking-wider uppercase bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-md font-bold">
                LOCKED
              </span>
            )}

            <button
              className="text-xs text-zinc-400 hover:text-white px-1.5 py-0.5 rounded transition-transform duration-200"
              style={{ transform: isSheetExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▲
            </button>
          </div>
        </div>

        {/* Sheet Scrollable Body */}
        {isSheetExpanded && (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* Standby State when game has not started yet */}
            {!currentLevel && (
              <div className="flex-1 py-4 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-400/30 flex items-center justify-center text-cyan-400 text-xl animate-pulse shadow-lg">
                  📡
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                    STANDBY // MISSION READY
                  </span>
                  <h3 className="text-base font-black text-white mt-1">Awaiting Event Kickoff</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed font-sans">
                    Squad <strong>{teamName}</strong> is registered. When coordinators initiate the synchronized kickoff, your unique starting landmark will unlock automatically.
                  </p>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-3.5 py-1.5 rounded-xl border border-zinc-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{pos ? `GPS Sensor Calibrated (±${Math.round(pos.accuracy)}m)` : 'Acquiring GPS fix…'}</span>
                </div>
              </div>
            )}

            {/* 1. Clue Intel Box */}
            {currentLevel && (
              <>
                {locationReached ? (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
                <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  CLASSIFIED FIELD BRIEFING
                </span>
                <p className="text-xs text-zinc-200 font-normal leading-relaxed">
                  {level?.clueText}
                </p>
              </div>
            ) : (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 text-center flex flex-col items-center gap-2">
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
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 flex flex-col gap-1">
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                  CAMPUS SECTOR GUIDANCE
                </span>
                <p className="text-xs text-zinc-300 font-medium leading-relaxed">
                  {level.locationHint}
                </p>
              </div>
            )}

            {/* 3. External Links */}
            {level && level.socialLinks.length > 0 && locationReached && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3 flex flex-col gap-2">
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                  EXTERNAL DOSSIER LINKS
                </span>
                <div className="flex flex-wrap gap-2">
                  {level.socialLinks.map((sl, i) => (
                    <a
                      key={i}
                      href={sl.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-cyan-300 text-xs font-mono uppercase hover:border-zinc-500 transition-all flex items-center gap-1.5"
                    >
                      <span>{sl.platform}</span>
                      <span className="text-[10px]">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Tactical Assistance Hints */}
            {!isCompleted && level && level.hints.length > 0 && locationReached && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                    TACTICAL ASSISTANCE DECRYPTS
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    {currentLevel?.hintsUsed ?? 0}/3 USED
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {level.hints.map((hint) => {
                    const revealed = revealedHintIds.has(hint.id) || revealedHints[hint.id];
                    const text = revealedHints[hint.id];

                    return (
                      <div key={hint.id} className="bg-zinc-950 rounded-xl p-3 border border-zinc-800">
                        {revealed && text ? (
                          <p className="text-xs text-amber-300 font-mono leading-relaxed">{text}</p>
                        ) : revealed ? (
                          <p className="text-xs text-zinc-400 font-mono italic">Hint decrypted.</p>
                        ) : (
                          <button
                            onClick={() => useHint(hint)}
                            disabled={hintLoading === hint.orderIndex || (currentLevel?.hintsUsed ?? 0) >= 3}
                            className="w-full text-left text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center justify-between min-h-[36px]"
                          >
                            <span className="font-mono text-xs">REVEAL INTEL #{hint.orderIndex}</span>
                            <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-amber-300">
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

            {/* 5. Mission Solution Decoder Form OR Finale Photo Upload */}
            {level?.isFinal ? (
              <div className="bg-zinc-900/80 border-2 border-emerald-500/40 rounded-2xl p-4 text-center flex flex-col gap-3 shadow-xl">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto font-mono font-bold text-sm">
                  🏁
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
                    GRAND FINALE OBJECTIVE
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-1 max-w-xs mx-auto">
                    1. Intercept target operative at Amphitheatre.<br />
                    2. Capture live photo together.<br />
                    3. Sprint to <strong>Start Venue</strong> and present proof!
                  </p>
                </div>

                <div className="pt-1 flex flex-col items-center gap-2">
                  <label className="cursor-pointer py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2">
                    <span>📷</span>
                    <span>
                      {photoUploading
                        ? 'TRANSMITTING PHOTO…'
                        : photoUploaded
                        ? '✓ PHOTO TRANSMITTED (TAP TO RE-TAKE)'
                        : 'SNAP & TRANSMIT PHOTO'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={photoUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPhotoError('');
                        setPhotoUploading(true);
                        try {
                          const fd = new FormData();
                          fd.append('photo', file);
                          await api.uploadPhoto(fd);
                          setPhotoUploaded(true);
                          triggerHaptic();
                        } catch (err: any) {
                          setPhotoError(err.message ?? 'Photo upload failed');
                        } finally {
                          setPhotoUploading(false);
                        }
                      }}
                    />
                  </label>
                  {photoError && <p className="text-rose-400 text-xs font-mono">{photoError}</p>}
                  {photoUploaded && (
                    <p className="text-emerald-400 text-[11px] font-mono">
                      ✓ Photo transmitted to Event Control! Sprint to Start Venue!
                    </p>
                  )}
                </div>
              </div>
            ) : !isCompleted && level ? (
              <form onSubmit={submitAnswer} className="flex flex-col gap-2 pt-1 pb-4">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="ENTER DECODED SOLUTION…"
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-cyan-400 transition-all"
                />

                {answerError && (
                  <p className="text-rose-400 text-xs font-mono font-semibold px-1">{answerError}</p>
                )}

                <button
                  type="submit"
                  disabled={answerLoading || !answer.trim()}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-widest shadow-xl transition-all min-h-[44px]"
                >
                  {answerLoading ? 'VERIFYING SOLUTION…' : 'TRANSMIT DECODED SOLUTION →'}
                </button>
              </form>
            ) : (
              <div className="text-center text-emerald-300 text-xs font-mono font-bold py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-4">
                ✓ STAGE ACCOMPLISHED. ADVANCE TO NEXT OBJECTIVE.
              </div>
            )}
              </>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          SQUAD OPERATIVE DOSSIER MODAL
          ========================================================================= */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[1200] bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  SQUAD DOSSIER
                </span>
                <h2 className="text-lg font-black text-white tracking-tight">{teamName}</h2>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-mono text-sm"
              >
                ✕
              </button>
            </div>

            {/* Tactical Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-center">
                <p className="text-2xl font-black font-mono text-white tabular-nums">
                  {completedCount}/{totalLevels}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 mt-0.5">
                  STAGES CLEARED
                </p>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-center">
                <p className="text-2xl font-black font-mono text-amber-400 tabular-nums">
                  {progress.reduce((s, p) => s + p.hintsUsed, 0)}
                </p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 mt-0.5">
                  HINTS USED
                </p>
              </div>
            </div>

            {/* Diagnostics */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 flex flex-col gap-2 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-300">
                <span>GPS Sensor</span>
                <span className="text-emerald-400 font-bold">
                  {pos ? `ONLINE (±${Math.round(pos.accuracy)}m)` : 'SEARCHING…'}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Telemetry Stream</span>
                <span className={connected ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-400 border border-zinc-700 hover:border-rose-500/30 text-xs font-mono font-bold transition-all"
            >
              SIGN OUT OF FIELD TERMINAL
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          CELEBRATION CLUE DROP MODAL
          ========================================================================= */}
      {showClueModal && level && (
        <ClueDropModal
          levelTitle={level.title}
          orderIndex={level.orderIndex}
          clueText={level.clueText}
          locationHint={level.locationHint}
          onClose={() => setShowClueModal(false)}
        />
      )}
    </div>
  );
}
