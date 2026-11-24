import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, Tooltip, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import {
  SDMCET_CENTER,
  SDMCET_MAX_BOUNDS,
  SDMCET_CAMPUS_POLYGON,
  SATELLITE_SOURCES,
} from '../../lib/mapConfig';
import { MapResizer } from '../../components/MapResizer';

// Map Viewport Controller to pan/zoom smoothly
function MapController({
  focusCoords,
  fitBoundsCoords,
}: {
  focusCoords: [number, number] | null;
  fitBoundsCoords: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (focusCoords) {
      map.flyTo(focusCoords, 19, { duration: 1 });
    }
  }, [focusCoords, map]);

  useEffect(() => {
    if (fitBoundsCoords && fitBoundsCoords.length > 0) {
      if (fitBoundsCoords.length === 1) {
        map.flyTo(fitBoundsCoords[0], 18, { duration: 1 });
      } else {
        const bounds = L.latLngBounds(fitBoundsCoords);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
      }
    }
  }, [fitBoundsCoords, map]);

  return null;
}

// Color palette for team markers
const TEAM_COLORS = [
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

function getTeamColor(teamId: number): string {
  return TEAM_COLORS[teamId % TEAM_COLORS.length];
}

// Custom leaflet marker icon for a team
function createTeamMarkerIcon(
  teamName: string,
  teamId: number,
  isFinished: boolean,
  isSelected: boolean,
) {
  const color = isFinished ? '#34d399' : getTeamColor(teamId);

  return L.divIcon({
    className: 'custom-admin-team-marker',
    html: `
      <div class="relative flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-125 select-none">
        ${
          isSelected
            ? `<div class="absolute -inset-2.5 rounded-full bg-cyan-400/40 animate-ping pointer-events-none"></div>`
            : ''
        }
        <div class="relative w-7 h-7 rounded-full flex items-center justify-center shadow-2xl border-2 ${
          isFinished
            ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
            : isSelected
            ? 'bg-zinc-950 border-cyan-400 text-cyan-300 scale-110'
            : 'bg-zinc-950 text-white'
        }" style="border-color: ${color};">
          <span class="text-[10px] font-mono font-black">#${teamId}</span>
        </div>
        <div class="mt-1 px-1.5 py-0.5 rounded-md bg-zinc-950/95 backdrop-blur-md border border-zinc-800 text-[10px] font-mono font-bold text-zinc-200 tracking-tight whitespace-nowrap shadow-xl max-w-[120px] truncate" style="border-bottom: 2px solid ${color};">
          ${teamName}
        </div>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 21],
  });
}

// Landmark target pin icon
function createLandmarkIcon(orderIndex: number, isFinal: boolean) {
  return L.divIcon({
    className: 'custom-admin-landmark-marker',
    html: `
      <div class="relative flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 select-none hover:scale-110 transition-transform">
        <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-lg border ${
          isFinal
            ? 'bg-purple-950 border-purple-400 text-purple-300'
            : 'bg-zinc-900 border-zinc-700 text-zinc-300'
        }">
          <span class="text-[9px] font-mono font-bold">${isFinal ? '🏁' : orderIndex}</span>
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function AdminMap() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');

  // Focus and Selection
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [hoveredTeamId, setHoveredTeamId] = useState<number | null>(null);
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);
  const [fitBoundsCoords, setFitBoundsCoords] = useState<[number, number][] | null>(null);

  // Nudge Modal State
  const [nudgeTeam, setNudgeTeam] = useState<any | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState<string>('');
  const [isSendingNudge, setIsSendingNudge] = useState<boolean>(false);
  const [copiedCodeTeamId, setCopiedCodeTeamId] = useState<number | null>(null);

  // Live real-time location state: teamId -> { lat, lng, recordedAt }
  const [liveLocations, setLiveLocations] = useState<
    Record<number, { lat: number; lng: number; recordedAt: string }>
  >({});

  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;

  // Load initial telemetry
  useEffect(() => {
    reloadAll();

    const socket = getSocket();

    // Live GPS telemetry from participants
    socket.on(
      'admin:team_location',
      (data: { teamId: number; teamName?: string; lat: number; lng: number; recordedAt: string }) => {
        setLiveLocations((prev) => ({
          ...prev,
          [data.teamId]: {
            lat: data.lat,
            lng: data.lng,
            recordedAt: data.recordedAt || new Date().toISOString(),
          },
        }));
      },
    );

    // Checkpoint & Level changes
    socket.on('team:checkpoint_reached', () => reloadTeams());
    socket.on('level:unlocked', () => reloadTeams());
    socket.on('winner:declared', () => reloadTeams());
    const handleStatusUpdate = (data: any) => {
      const statusData = data.game || data;
      setGame((g: any) => (g ? { ...g, ...statusData } : statusData));
      reloadTeams();
    };
    socket.on('game:status_changed', handleStatusUpdate);
    socket.on('game:status', handleStatusUpdate);

    return () => {
      socket.off('admin:team_location');
      socket.off('team:checkpoint_reached');
      socket.off('level:unlocked');
      socket.off('winner:declared');
      socket.off('game:status_changed', handleStatusUpdate);
      socket.off('game:status', handleStatusUpdate);
    };
  }, []);

  async function reloadAll() {
    try {
      const [games, teamsData] = await Promise.all([
        api.getGames().catch(() => []),
        api.getAdminTeams().catch(() => []),
      ]);

      const activeGame = games[0] ?? null;
      setGame(activeGame);
      setTeams(teamsData);

      // Populate initial locations
      const initialLocs: Record<number, { lat: number; lng: number; recordedAt: string }> = {};
      for (const t of teamsData) {
        if (t.locations && t.locations[0]) {
          initialLocs[t.id] = {
            lat: t.locations[0].lat,
            lng: t.locations[0].lng,
            recordedAt: t.locations[0].recordedAt,
          };
        }
      }
      setLiveLocations((prev) => ({ ...initialLocs, ...prev }));

      if (activeGame) {
        const [lvlData, zoneData] = await Promise.all([
          api.getLevels(activeGame.id).catch(() => []),
          api.getZones(activeGame.id).catch(() => []),
        ]);
        setLevels(lvlData.sort((a, b) => a.orderIndex - b.orderIndex));
        setZones(zoneData);
      }
    } catch (err) {
      console.error('Failed to load admin map telemetry:', err);
    }
  }

  async function reloadTeams() {
    try {
      const teamsData = await api.getAdminTeams();
      setTeams(teamsData);
    } catch {}
  }

  // Combined teams with their resolved latest locations
  const teamsWithLocations = useMemo(() => {
    return teams.map((team) => {
      const live = liveLocations[team.id];
      const dbLoc = team.locations?.[0];
      const lat = live?.lat ?? dbLoc?.lat ?? null;
      const lng = live?.lng ?? dbLoc?.lng ?? null;
      const recordedAt = live?.recordedAt ?? dbLoc?.recordedAt ?? null;
      const isFinished = Boolean(team.finishedAt);
      const activeProgress = team.levelProgress?.find((p: any) => !p.completedAt);
      const completedCount = team.levelProgress?.filter((p: any) => p.completedAt).length ?? 0;
      const currentStep = activeProgress?.stepNumber ?? (completedCount + (isFinished ? 0 : 1));

      return {
        ...team,
        lat,
        lng,
        recordedAt,
        hasLocation: lat != null && lng != null,
        isFinished,
        currentStep,
        activeLevelTitle: activeProgress?.level?.title ?? (isFinished ? 'Completed Hunt 🏁' : 'Objective 1'),
      };
    });
  }, [teams, liveLocations]);

  // Teams that have a physical GPS location on map
  const mappedTeams = useMemo(() => {
    return teamsWithLocations.filter((t) => t.hasLocation);
  }, [teamsWithLocations]);

  const activeFocusTeam = useMemo(() => {
    const targetId = selectedTeamId ?? hoveredTeamId;
    if (!targetId) return null;
    return teamsWithLocations.find((t) => t.id === targetId) ?? null;
  }, [teamsWithLocations, selectedTeamId, hoveredTeamId]);

  // Fit all squads on map
  function handleFitAllSquads() {
    const coords: [number, number][] = mappedTeams.map((t) => [t.lat, t.lng]);
    if (coords.length > 0) {
      setFitBoundsCoords(coords);
    } else {
      setFocusCoords(SDMCET_CENTER);
    }
  }

  function handleCopyCode(teamId: number, code: string) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCodeTeamId(teamId);
    setTimeout(() => setCopiedCodeTeamId(null), 2000);
  }

  // Send Radio Nudge
  async function handleSendNudge(e: React.FormEvent) {
    e.preventDefault();
    if (!game || !nudgeTeam || !nudgeMessage.trim()) return;

    setIsSendingNudge(true);
    try {
      await api.sendAnnouncement(game.id, nudgeMessage.trim(), 'nudge', nudgeTeam.id);
      alert(`Nudge transmitted to ${nudgeTeam.name}!`);
      setNudgeTeam(null);
      setNudgeMessage('');
    } catch (err: any) {
      alert(err.message ?? 'Failed to send nudge');
    } finally {
      setIsSendingNudge(false);
    }
  }

  let campusBounds: [[number, number], [number, number]] | null = null;
  if (game?.campusMapBounds) {
    try {
      campusBounds = JSON.parse(game.campusMapBounds);
    } catch {}
  }

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] md:h-screen bg-zinc-950 text-zinc-100 flex overflow-hidden select-none">
      {/* =========================================================================
          FULL-SCREEN INTERACTIVE SATELLITE MAP (NO BLOCKING ROSTER DRAWER)
          ========================================================================= */}
      <div className="relative h-full w-full">
        {/* Floating Top Minimal Bar */}
        <div className="absolute top-3 inset-x-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          {/* Left: Tactical Badge */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-3 py-1.5 rounded-xl shadow-xl flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-white tracking-wider">
                FIELD RADAR
              </span>
              <span className="text-[11px] font-mono text-zinc-400 border-l border-zinc-800 pl-2.5">
                <strong className="text-cyan-300 font-bold">{mappedTeams.length}</strong> / {teams.length} Live
              </span>
            </div>

            {game && (
              <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-2.5 py-1.5 rounded-xl shadow-xl flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    game.status === 'running'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : game.status === 'paused'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {game.status}
                </span>

                {game.status === 'running' && (
                  <button
                    onClick={async () => {
                      try {
                        const updated: any = await api.patchGameStatus(game.id, 'pause');
                        setGame((g: any) => ({ ...(g || {}), ...(updated || {}) }));
                      } catch (err: any) {
                        alert(err.message ?? 'Pause failed');
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 transition-all active:scale-95"
                  >
                    ⏸ Pause
                  </button>
                )}

                {game.status === 'paused' && (
                  <button
                    onClick={async () => {
                      try {
                        const updated: any = await api.patchGameStatus(game.id, 'resume');
                        setGame((g: any) => ({ ...(g || {}), ...(updated || {}) }));
                      } catch (err: any) {
                        alert(err.message ?? 'Resume failed');
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono text-[10px] font-black transition-all active:scale-95"
                  >
                    ▶ Resume
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Map Actions */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {/* Satellite Source Switcher */}
            <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 px-2 py-1 rounded-xl shadow-xl">
              <select
                value={selectedSourceKey}
                onChange={(e) => setSelectedSourceKey(e.target.value)}
                className="bg-transparent text-[11px] font-mono text-zinc-300 border-none outline-none cursor-pointer"
              >
                <option value="google" className="bg-zinc-900 text-white">Google Satellite</option>
                <option value="google_hybrid" className="bg-zinc-900 text-white">Hybrid (Sat + Roads)</option>
                <option value="esri" className="bg-zinc-900 text-white">Esri World</option>
                <option value="osm" className="bg-zinc-900 text-white">Street Map</option>
              </select>
            </div>

            {/* Fit All Squads */}
            <button
              onClick={handleFitAllSquads}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-950/90 backdrop-blur-md border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white shadow-xl active:scale-95 transition-all flex items-center gap-1"
              title="Fit all tracked squads in view"
            >
              <span>🎯</span>
              <span>Fit</span>
            </button>

            {/* Center SDMCET Campus */}
            <button
              onClick={() => setFocusCoords(SDMCET_CENTER)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-950/90 backdrop-blur-md border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white shadow-xl active:scale-95 transition-all"
              title="Reset to Campus Center"
            >
              Center
            </button>
          </div>
        </div>

        {/* Map Container */}
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
          <MapController focusCoords={focusCoords} fitBoundsCoords={fitBoundsCoords} />

          {/* Tile Layer */}
          <TileLayer
            key={activeSource.id}
            attribution={activeSource.attribution}
            url={activeSource.url}
            className="satellite-tiles"
            maxZoom={activeSource.maxZoom}
          />

          {/* Campus Perimeter Boundary */}
          <Polygon
            positions={SDMCET_CAMPUS_POLYGON}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#38bdf8',
              fillOpacity: 0.03,
              weight: 2,
              dashArray: '4 4',
            }}
          />

          {/* Blueprint Overlay if uploaded */}
          {game?.campusMapUrl && campusBounds && (
            <ImageOverlay url={game.campusMapUrl} bounds={campusBounds} opacity={0.7} />
          )}

          {/* Zones (Permitted & Restricted Hazard areas) */}
          {zones.map((zone: any) => {
            if (!zone.active) return null;
            try {
              const geo = JSON.parse(zone.geoJson);
              const coords: [number, number][] = geo.coordinates[0].map(([lng, lat]: number[]) => [lat, lng]);
              const isRestricted = zone.kind === 'restricted';

              return (
                <Polygon
                  key={zone.id}
                  positions={coords}
                  pathOptions={{
                    color: isRestricted ? '#ef4444' : '#10b981',
                    fillColor: isRestricted ? '#ef4444' : '#10b981',
                    fillOpacity: isRestricted ? 0.35 : 0.06,
                    weight: 1.5,
                    dashArray: isRestricted ? '4 4' : undefined,
                  }}
                >
                  <Popup className="custom-admin-popup">
                    <div className="p-2 font-mono text-xs">
                      <p className="font-bold text-white">{zone.label || (isRestricted ? 'Restricted Zone' : 'Boundary')}</p>
                      {isRestricted && (
                        <p className="text-rose-400 mt-0.5">Penalty: +{zone.penaltyMins}m</p>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              );
            } catch {
              return null;
            }
          })}

          {/* Landmark Clue Locations */}
          {levels.map((lvl) => {
            if (lvl.targetLat == null || lvl.targetLng == null) return null;
            return (
              <div key={`landmark-${lvl.id}`}>
                <Circle
                  center={[lvl.targetLat, lvl.targetLng]}
                  radius={lvl.triggerRadiusMeters ?? 20}
                  pathOptions={{
                    color: lvl.isFinal ? '#c084fc' : '#71717a',
                    fillColor: lvl.isFinal ? '#c084fc' : '#71717a',
                    fillOpacity: 0.12,
                    weight: 1,
                  }}
                />
                <Marker
                  position={[lvl.targetLat, lvl.targetLng]}
                  icon={createLandmarkIcon(lvl.orderIndex, lvl.isFinal)}
                >
                  <Popup className="custom-admin-popup">
                    <div className="p-2 font-mono text-xs max-w-xs">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] uppercase font-bold">
                        <span>Station #{lvl.orderIndex}</span>
                        {lvl.isFinal && <span className="text-purple-400">• FINALE</span>}
                      </div>
                      <h4 className="font-bold text-white text-xs mt-0.5">{lvl.title}</h4>
                      {lvl.locationHint && (
                        <p className="text-zinc-300 mt-0.5 text-[11px]">{lvl.locationHint}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </div>
            );
          })}

          {/* REAL-TIME TEAM MARKERS */}
          {mappedTeams.map((team) => {
            const isSelected = selectedTeamId === team.id;

            return (
              <Marker
                key={`team-${team.id}`}
                position={[team.lat, team.lng]}
                icon={createTeamMarkerIcon(team.name, team.id, team.isFinished, isSelected)}
                eventHandlers={{
                  click: () => {
                    setSelectedTeamId(team.id);
                  },
                  mouseover: () => {
                    setHoveredTeamId(team.id);
                  },
                  mouseout: () => {
                    setHoveredTeamId(null);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
                  <div className="p-1 font-mono text-xs text-white">
                    <div className="font-bold text-cyan-300">{team.name}</div>
                    <div className="text-[10px] text-zinc-300">
                      {team.isFinished ? 'Finished 🏁' : `Step ${team.currentStep}/10`}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>

        {/* =========================================================================
            FLOATING SQUAD DETAIL CARD (SHOWN ONLY WHEN TEAM IS HOVERED OR CLICKED)
            ========================================================================= */}
        {activeFocusTeam && (
          <div className="absolute bottom-5 left-4 right-4 md:right-auto md:w-96 z-[1000] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">
                    Squad #{activeFocusTeam.id}
                  </span>
                  {activeFocusTeam.isFinished ? (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold font-mono">
                      FINISHED 🏁
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold font-mono">
                      Step {activeFocusTeam.currentStep} / 10
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-base mt-0.5">{activeFocusTeam.name}</h3>
                {activeFocusTeam.leaderName && (
                  <p className="text-[11px] text-zinc-400 font-mono">Leader: {activeFocusTeam.leaderName}</p>
                )}
              </div>

              {selectedTeamId && (
                <button
                  onClick={() => setSelectedTeamId(null)}
                  className="w-6 h-6 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-mono transition-all"
                  title="Close squad card"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Target Landmark & Access Code */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80">
              <div>
                <span className="text-[9px] text-zinc-500 uppercase block">Current Target</span>
                <span className="text-zinc-200 font-bold truncate block mt-0.5">
                  {activeFocusTeam.activeLevelTitle}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-zinc-500 uppercase block">Access Code</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <code className="text-amber-300 font-bold bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                    {activeFocusTeam.displayCode || '••••••'}
                  </code>
                  {activeFocusTeam.displayCode && (
                    <button
                      type="button"
                      onClick={() => handleCopyCode(activeFocusTeam.id, activeFocusTeam.displayCode)}
                      className="text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800"
                    >
                      {copiedCodeTeamId === activeFocusTeam.id ? '✓' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 pt-1">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${activeFocusTeam.lat},${activeFocusTeam.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-center text-zinc-200 text-[11px] font-mono font-medium transition-all"
              >
                Maps ↗
              </a>
              <button
                onClick={() => setNudgeTeam(activeFocusTeam)}
                className="flex-1 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono font-bold transition-all"
              >
                Nudge
              </button>
              {!activeFocusTeam.isFinished && (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.bypassTeamGps(activeFocusTeam.id);
                        alert(`GPS bypassed! Clue "${res.levelTitle ?? 'Target'}" unlocked for ${activeFocusTeam.name}.`);
                        reloadTeams();
                      } catch (err: any) {
                        alert(err.message ?? 'Bypass failed');
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold transition-all"
                    title="Bypass GPS requirement"
                  >
                    Bypass GPS
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.forceAdvanceTeam(activeFocusTeam.id);
                        alert(`Advanced ${activeFocusTeam.name} to Step ${res.nextStepNumber ?? 'Next'}!`);
                        reloadTeams();
                      } catch (err: any) {
                        alert(err.message ?? 'Advance failed');
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-mono font-bold transition-all"
                    title="Advance to next stage"
                  >
                    Advance ➔
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nudge Modal */}
        {nudgeTeam && (
          <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-bold text-white text-sm font-mono">
                  Send Nudge to {nudgeTeam.name}
                </h3>
                <button
                  onClick={() => setNudgeTeam(null)}
                  className="text-zinc-400 hover:text-white font-mono text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSendNudge} className="flex flex-col gap-3">
                <input
                  type="text"
                  value={nudgeMessage}
                  onChange={(e) => setNudgeMessage(e.target.value)}
                  placeholder="Enter message for team phone…"
                  required
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNudgeTeam(null)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingNudge}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs font-mono transition-all"
                  >
                    {isSendingNudge ? 'Transmitting…' : 'Transmit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
