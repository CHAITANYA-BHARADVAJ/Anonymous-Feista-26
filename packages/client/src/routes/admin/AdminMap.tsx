import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, ImageOverlay, useMap } from 'react-leaflet';
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
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
      }
    }
  }, [fitBoundsCoords, map]);

  return null;
}

// Generate color palette for teams
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

// Create custom leaflet marker icon for a team
function createTeamMarkerIcon(
  teamName: string,
  teamId: number,
  hasSos: boolean,
  isFinished: boolean,
  isSelected: boolean,
) {
  const color = hasSos ? '#ef4444' : isFinished ? '#6ee7b7' : getTeamColor(teamId);
  const glowClass = hasSos ? 'animate-ping' : '';

  return L.divIcon({
    className: 'custom-admin-team-marker',
    html: `
      <div class="relative flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110 select-none">
        ${
          hasSos
            ? `<div class="absolute -inset-2.5 rounded-full bg-rose-500/40 ${glowClass}"></div>`
            : isSelected
            ? `<div class="absolute -inset-2 rounded-full bg-cyan-400/30 animate-pulse"></div>`
            : ''
        }
        <div class="relative w-7 h-7 rounded-full flex items-center justify-center shadow-xl border-2 ${
          hasSos
            ? 'bg-rose-950 border-rose-500 text-rose-300'
            : isFinished
            ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
            : isSelected
            ? 'bg-zinc-950 border-cyan-400 text-cyan-300 scale-110'
            : 'bg-zinc-950 border-zinc-700 text-white'
        }" style="border-color: ${color};">
          <span class="text-[10px] font-mono font-black">${hasSos ? 'SOS' : '#' + teamId}</span>
        </div>
        <div class="mt-1 px-1.5 py-0.5 rounded-md bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-[10px] font-mono font-bold text-zinc-200 tracking-tight whitespace-nowrap shadow-md max-w-[110px] truncate" style="border-bottom: 2px solid ${color};">
          ${teamName}
        </div>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 21],
  });
}

// Landmark target pin icon
function createLandmarkIcon(orderIndex: number, isFinal: boolean) {
  return L.divIcon({
    className: 'custom-admin-landmark-marker',
    html: `
      <div class="relative flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 select-none">
        <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-md border ${
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
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');

  // Focus and Selection
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);
  const [fitBoundsCoords, setFitBoundsCoords] = useState<[number, number][] | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'sos' | 'finished'>('all');
  const [showRosterDrawer, setShowRosterDrawer] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Nudge Modal State
  const [nudgeTeam, setNudgeTeam] = useState<any | null>(null);
  const [nudgeMessage, setNudgeMessage] = useState<string>('');
  const [isSendingNudge, setIsSendingNudge] = useState<boolean>(false);

  // Live real-time location state: teamId -> { lat, lng, recordedAt }
  const [liveLocations, setLiveLocations] = useState<
    Record<number, { lat: number; lng: number; recordedAt: string }>
  >({});

  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;

  // Load initial state
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

    // SOS Alerts
    socket.on('sos:received', (alert: any) => {
      setSosAlerts((prev) => [alert, ...prev.filter((s) => s.id !== alert.id)]);
    });

    socket.on('sos:resolved', ({ id }: { id: number }) => {
      setSosAlerts((prev) => prev.filter((s) => s.id !== id));
    });

    // Checkpoint & Level changes
    socket.on('team:checkpoint_reached', () => reloadTeams());
    socket.on('level:unlocked', () => reloadTeams());
    socket.on('winner:declared', () => reloadTeams());
    socket.on('game:status_changed', (data: any) => {
      setGame((g: any) => (g ? { ...g, ...data } : g));
      reloadTeams();
    });

    return () => {
      socket.off('admin:team_location');
      socket.off('sos:received');
      socket.off('sos:resolved');
      socket.off('team:checkpoint_reached');
      socket.off('level:unlocked');
      socket.off('winner:declared');
      socket.off('game:status_changed');
    };
  }, []);

  async function reloadAll() {
    try {
      const [games, teamsData, sosData] = await Promise.all([
        api.getGames(),
        api.getAdminTeams(),
        api.getSosAlerts().catch(() => []),
      ]);

      const activeGame = games[0] ?? null;
      setGame(activeGame);
      setTeams(teamsData);
      setSosAlerts(sosData);

      // Populate initial locations from teamsData
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
      const hasSos = sosAlerts.some((s) => s.teamId === team.id);
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
        hasSos,
        isFinished,
        currentStep,
        activeLevelTitle: activeProgress?.level?.title ?? (isFinished ? 'Completed Hunt' : 'Waiting for Clue'),
      };
    });
  }, [teams, liveLocations, sosAlerts]);

  // Filtered teams list
  const filteredTeams = useMemo(() => {
    return teamsWithLocations.filter((t) => {
      if (search.trim()) {
        const matches = t.name.toLowerCase().includes(search.toLowerCase());
        if (!matches) return false;
      }
      if (filter === 'active') return !t.isFinished;
      if (filter === 'sos') return t.hasSos;
      if (filter === 'finished') return t.isFinished;
      return true;
    });
  }, [teamsWithLocations, search, filter]);

  // Teams that have a physical GPS location on map
  const mappedTeams = useMemo(() => {
    return filteredTeams.filter((t) => t.hasLocation);
  }, [filteredTeams]);

  // Fit all active squads on map
  function handleFitAllSquads() {
    const coords: [number, number][] = mappedTeams.map((t) => [t.lat, t.lng]);
    if (coords.length > 0) {
      setFitBoundsCoords(coords);
    } else {
      setFocusCoords(SDMCET_CENTER);
    }
  }

  // Focus a specific squad
  function handleSelectSquad(team: any) {
    setSelectedTeamId(team.id);
    if (team.hasLocation) {
      setFocusCoords([team.lat, team.lng]);
    }
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

  const sosCount = sosAlerts.length;

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100 flex overflow-hidden select-none">
      {/* =========================================================================
          MAIN INTERACTIVE SATELLITE MAP VIEWPORT
          ========================================================================= */}
      <div className="relative flex-1 h-full w-full">
        {/* Floating Top Controls Overlay */}
        <div className="absolute top-3 inset-x-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
          {/* Left: Summary Badge & SOS Banner */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Live Field Radar
                </span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 border-l border-zinc-800 pl-3 flex items-center gap-2">
                <span>Mapped:</span>
                <strong className="text-cyan-300 font-bold">
                  {mappedTeams.length} / {teams.length} Squads
                </strong>
              </div>
            </div>

            {sosCount > 0 && (
              <div className="bg-rose-950/90 border border-rose-500/50 px-3 py-2 rounded-2xl text-xs font-mono text-rose-300 font-bold shadow-2xl flex items-center gap-2 animate-bounce">
                <span>🚨</span>
                <span>{sosCount} ACTIVE SOS DISTRESS CALL(S)</span>
              </div>
            )}
          </div>

          {/* Right: Layer Switcher & Viewport Actions */}
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Satellite Source Switcher */}
            <div className="bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 px-2.5 py-1.5 rounded-2xl shadow-2xl">
              <select
                value={selectedSourceKey}
                onChange={(e) => setSelectedSourceKey(e.target.value)}
                className="bg-transparent text-[11px] font-mono text-zinc-300 border-none outline-none cursor-pointer"
              >
                <option value="google" className="bg-zinc-900 text-white">Google Satellite</option>
                <option value="google_hybrid" className="bg-zinc-900 text-white">Hybrid (Sat + Roads)</option>
                <option value="esri" className="bg-zinc-900 text-white">Esri Imagery</option>
                <option value="osm" className="bg-zinc-900 text-white">Street Map</option>
              </select>
            </div>

            {/* Fit All Squads */}
            <button
              onClick={handleFitAllSquads}
              className="px-3 py-2 rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white shadow-2xl active:scale-95 transition-all flex items-center gap-1.5"
              title="Fit all tracked squads in view"
            >
              <span>🎯</span>
              <span>Fit Squads</span>
            </button>

            {/* Reset SDMCET Campus Center */}
            <button
              onClick={() => setFocusCoords(SDMCET_CENTER)}
              className="px-3 py-2 rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white shadow-2xl active:scale-95 transition-all"
              title="Reset to Campus Center"
            >
              Center SDMCET
            </button>

            {/* Toggle Drawer Button */}
            <button
              onClick={() => setShowRosterDrawer((prev) => !prev)}
              className="px-3 py-2 rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-cyan-300 hover:text-white shadow-2xl active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>{showRosterDrawer ? 'Hide Roster ✕' : 'Show Roster 📋'}</span>
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

          {/* Campus Map Blueprint Overlay if present */}
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
                        <p className="text-rose-400 mt-1">Hazard Penalty: +{zone.penaltyMins} mins</p>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              );
            } catch {
              return null;
            }
          })}

          {/* Landmark Clue Locations (Pins across campus) */}
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
                    <div className="p-2.5 font-mono text-xs max-w-xs">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] uppercase font-bold">
                        <span>Station #{lvl.orderIndex}</span>
                        {lvl.isFinal && <span className="text-purple-400">• GRAND FINALE</span>}
                      </div>
                      <h4 className="font-bold text-white text-sm mt-0.5">{lvl.title}</h4>
                      <p className="text-zinc-300 mt-1 text-[11px] leading-relaxed">{lvl.locationHint}</p>
                      <p className="text-zinc-500 mt-1 text-[10px]">
                        Trigger Radius: {lvl.triggerRadiusMeters ?? 20}m
                      </p>
                    </div>
                  </Popup>
                </Marker>
              </div>
            );
          })}

          {/* REAL-TIME TEAM MARKERS */}
          {mappedTeams.map((team) => {
            const hasSos = team.hasSos;
            const isSelected = selectedTeamId === team.id;

            return (
              <Marker
                key={`team-${team.id}`}
                position={[team.lat, team.lng]}
                icon={createTeamMarkerIcon(team.name, team.id, hasSos, team.isFinished, isSelected)}
                eventHandlers={{
                  click: () => setSelectedTeamId(team.id),
                }}
              >
                <Popup className="custom-admin-popup">
                  <div className="p-3 font-mono text-xs max-w-xs flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                      <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                        SQUAD #{team.id}
                      </span>
                      {hasSos && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                          SOS ACTIVE
                        </span>
                      )}
                      {team.isFinished && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          FINISHED
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-black text-white text-sm">{team.name}</h4>
                      {team.leaderName && (
                        <p className="text-zinc-400 text-[11px]">Leader: {team.leaderName}</p>
                      )}
                    </div>

                    <div className="bg-zinc-900/80 rounded-lg p-2 border border-zinc-800 text-[11px] flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Current Progress:</span>
                        <strong className="text-white">Step {team.currentStep} / 10</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Target Station:</span>
                        <span className="text-zinc-200 font-semibold truncate max-w-[140px]">
                          {team.activeLevelTitle}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Last Telemetry:</span>
                        <span className="text-zinc-300">
                          {team.recordedAt
                            ? new Date(team.recordedAt).toLocaleTimeString()
                            : 'Live'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons inside popup */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${team.lat},${team.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-center text-zinc-200 text-[10px] font-bold transition-all flex items-center justify-center gap-1"
                      >
                        <span>🗺️</span>
                        <span>Google Maps</span>
                      </a>
                      <button
                        onClick={() => setNudgeTeam(team)}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold transition-all flex items-center justify-center gap-1"
                      >
                        <span>📡</span>
                        <span>Radio Nudge</span>
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* =========================================================================
          RIGHT-SIDE FLOATING SQUAD ROSTER DRAWER
          ========================================================================= */}
      {showRosterDrawer && (
        <div className="w-80 md:w-96 bg-zinc-950/95 backdrop-blur-2xl border-l border-zinc-800 flex flex-col h-full shadow-2xl z-[1050]">
          {/* Drawer Header */}
          <div className="p-4 border-b border-zinc-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm font-mono tracking-tight flex items-center gap-2">
                  <span>Squad Telemetry</span>
                  <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-300">
                    {filteredTeams.length}
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">Click any squad to center radar</p>
              </div>
              <button
                onClick={() => setShowRosterDrawer(false)}
                className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-mono transition-all"
              >
                ✕
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  filter === 'all' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({teams.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  filter === 'active' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Racing
              </button>
              {sosCount > 0 && (
                <button
                  onClick={() => setFilter('sos')}
                  className={`flex-1 py-1 rounded-lg transition-all text-rose-400 ${
                    filter === 'sos' ? 'bg-rose-950/60 border border-rose-500/40 font-bold' : 'hover:text-rose-300'
                  }`}
                >
                  SOS ({sosCount})
                </button>
              )}
              <button
                onClick={() => setFilter('finished')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  filter === 'finished' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Done
              </button>
            </div>

            {/* Search Input */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search squads by call-sign…"
              className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition-all"
            />
          </div>

          {/* Squad Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {filteredTeams.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 font-mono text-xs">
                No matching squads located.
              </div>
            ) : (
              filteredTeams.map((team) => {
                const isSelected = selectedTeamId === team.id;
                const hasLocation = team.hasLocation;

                return (
                  <div
                    key={team.id}
                    onClick={() => handleSelectSquad(team)}
                    className={`p-3 rounded-2xl border text-xs font-mono cursor-pointer transition-all ${
                      team.hasSos
                        ? 'bg-rose-950/30 border-rose-500/40 hover:border-rose-400'
                        : isSelected
                        ? 'bg-cyan-950/30 border-cyan-400 shadow-lg'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: team.hasSos ? '#ef4444' : getTeamColor(team.id) }}
                        />
                        <span className="font-bold text-white truncate">{team.name}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {team.hasSos ? (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded font-bold animate-pulse">
                            SOS
                          </span>
                        ) : team.isFinished ? (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold">
                            FINISHED
                          </span>
                        ) : (
                          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                            Step {team.currentStep}/10
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-white/5 pt-1.5">
                      <span className="truncate max-w-[180px]">{team.activeLevelTitle}</span>
                      <span className={hasLocation ? 'text-emerald-400 text-[10px]' : 'text-zinc-600 text-[10px]'}>
                        {hasLocation ? '● GPS Online' : '○ No Signal'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          RADIO NUDGE MODAL
          ========================================================================= */}
      {nudgeTeam && (
        <div className="fixed inset-0 z-[1300] bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleSendNudge}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 font-mono text-xs"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>📡</span>
                <span>Radio Nudge to {nudgeTeam.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setNudgeTeam(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                Field Directive Message:
              </label>
              <textarea
                value={nudgeMessage}
                onChange={(e) => setNudgeMessage(e.target.value)}
                placeholder="e.g. Check the stairs on the east side..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition-all resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNudgeTeam(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingNudge || !nudgeMessage.trim()}
                className="flex-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50"
              >
                {isSendingNudge ? 'Transmitting…' : 'Transmit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
