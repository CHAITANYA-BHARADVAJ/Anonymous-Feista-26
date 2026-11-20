import { MapContainer, TileLayer, Polygon, Circle, Marker, ImageOverlay, useMap } from 'react-leaflet';
import { useGameStore } from '../../stores/gameStore';
import { useLocation } from '../../hooks/useLocation';
import DistanceRadar from '../../components/DistanceRadar';
import { computeDistanceMeters, computeBearingDegrees } from '../../lib/geo';
import { MapResizer } from '../../components/MapResizer';
import { SDMCET_CENTER, SDMCET_MAX_BOUNDS, SDMCET_CAMPUS_POLYGON, SATELLITE_SOURCES } from '../../lib/mapConfig';
import ClueDropModal from '../../components/ClueDropModal';
import { playClueUnlockedSound, triggerHaptic } from '../../lib/sound';
import { api } from '../../lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState, useMemo, useRef } from 'react';

// Custom sleek player marker icon
const playerIcon = L.divIcon({
  className: 'custom-player-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-8 h-8 rounded-full bg-cyan-400/25 animate-ping"></div>
    <div class="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-[#07080b] shadow-xl"></div>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Custom discovered target pin icon
const targetIcon = L.divIcon({
  className: 'custom-target-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="w-7 h-7 rounded-full bg-emerald-400 border-2 border-[#07080b] shadow-2xl flex items-center justify-center text-xs text-black font-black font-mono">✓</div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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

export default function MapView() {
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const setProgress = useGameStore((s) => s.setProgress);
  const { pos, refreshLocation } = useLocation();

  const [showModal, setShowModal] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');

  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;
  const zones = game?.zones ?? [];
  const targetLat = currentLevel?.level.targetLat;
  const targetLng = currentLevel?.level.targetLng;
  const triggerRadius = currentLevel?.level.triggerRadiusMeters ?? 25;
  const locationReached = !!currentLevel?.locationReachedAt;

  // Real-time distance calculation
  const distanceMeters = useMemo(() => {
    if (!pos || targetLat == null || targetLng == null) return null;
    return computeDistanceMeters(pos.latitude, pos.longitude, targetLat, targetLng);
  }, [pos?.latitude, pos?.longitude, targetLat, targetLng]);

  // Real-time azimuth / bearing to clue target
  const bearingDegrees = useMemo(() => {
    if (!pos || targetLat == null || targetLng == null) return null;
    return computeBearingDegrees(pos.latitude, pos.longitude, targetLat, targetLng);
  }, [pos?.latitude, pos?.longitude, targetLat, targetLng]);

  // Check-in action when in proximity range
  async function triggerCheckIn() {
    if (!currentLevel || isCheckingIn || !pos) return;
    setIsCheckingIn(true);
    try {
      await api.reachLocation(currentLevel.level.id, pos.latitude, pos.longitude);
      playClueUnlockedSound();
      triggerHaptic();
      const updated = await api.getParticipantGame();
      setProgress(updated.progress);
      setShowModal(true);
    } catch (err: any) {
      alert(err.message ?? 'Proximity check failed. Move closer to the target!');
    } finally {
      setIsCheckingIn(false);
    }
  }

  // Automatic trigger when player steps inside the geofence radius
  useEffect(() => {
    if (
      !locationReached &&
      distanceMeters !== null &&
      distanceMeters <= triggerRadius + 5 &&
      pos &&
      !isCheckingIn
    ) {
      triggerCheckIn();
    }
  }, [distanceMeters, locationReached, triggerRadius, pos]);

  // Optional custom campus graphic overlay if specified by coordinators
  let campusBounds: [[number, number], [number, number]] | null = null;
  if (game?.campusMapBounds) {
    try {
      campusBounds = JSON.parse(game.campusMapBounds);
    } catch {}
  }

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col relative bg-[#07080b] overflow-hidden select-none font-sans">
      {/* Top Aeronautics HUD Bar */}
      <div className="absolute top-3 inset-x-3 z-[1000] flex items-center justify-between pointer-events-none">
        <div className="bg-[#0c0e14]/90 backdrop-blur-xl border border-white/[0.08] px-3 py-1.5 rounded-2xl shadow-2xl flex items-center gap-2.5 pointer-events-auto">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300 font-bold">
              SDMCET FIELD RADAR
            </span>
            <span className="text-[9px] font-mono text-gray-400 tabular-nums">
              {pos ? `${pos.latitude.toFixed(4)}°N, ${pos.longitude.toFixed(4)}°E` : 'LOCKING GPS…'}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-1" />

          <select
            value={selectedSourceKey}
            onChange={(e) => setSelectedSourceKey(e.target.value)}
            className="bg-transparent text-[11px] font-mono text-gray-300 border-none outline-none cursor-pointer"
          >
            <option value="google" className="bg-[#0c0e14] text-white">Google Sat</option>
            <option value="google_hybrid" className="bg-[#0c0e14] text-white">Sat + Roads</option>
            <option value="esri" className="bg-[#0c0e14] text-white">Esri Satellite</option>
          </select>
        </div>

        {/* Locate / Recalibrate button */}
        <button
          onClick={refreshLocation}
          className="bg-[#0c0e14]/90 backdrop-blur-xl border border-white/[0.08] hover:border-white/25 w-10 h-10 rounded-2xl flex items-center justify-center text-cyan-300 text-sm shadow-2xl active:scale-95 transition-all pointer-events-auto"
          title="Recalibrate Live GPS Position"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="1" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      </div>

      {/* Main Fullscreen Satellite Map */}
      <div className="flex-1 w-full h-full min-h-[400px] relative">
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

          {/* Official SDMCET Campus Boundary Outline */}
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

          {/* Optional Campus Blueprint Overlay */}
          {game?.campusMapUrl && campusBounds && (
            <ImageOverlay url={game.campusMapUrl} bounds={campusBounds} opacity={0.8} />
          )}

          {/* SDMCET Campus Zones */}
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

          {/* Target Location: Pin is ONLY revealed once discovered in proximity! */}
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

          {/* Player Real-Time GPS Pin */}
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

      {/* Floating Tactical Telemetry Card */}
      {currentLevel && (
        <div className="absolute bottom-3 inset-x-3 z-[1000] pointer-events-auto">
          <div className="bg-[#0c0e14]/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-4 shadow-2xl">
            <DistanceRadar
              distanceMeters={distanceMeters}
              triggerRadius={triggerRadius}
              locationReached={locationReached}
              bearing={bearingDegrees}
              accuracy={pos?.accuracy}
              onTriggerCheckIn={triggerCheckIn}
              isLoading={isCheckingIn}
            />
          </div>
        </div>
      )}

      {/* Celebratory Clue Drop Modal */}
      {showModal && (
        <ClueDropModal
          levelTitle={currentLevel?.level.title ?? 'Clue Unlocked'}
          clueText={currentLevel?.level.clueText ?? ''}
          locationHint={currentLevel?.level.locationHint}
          orderIndex={currentLevel?.level.orderIndex ?? 1}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
