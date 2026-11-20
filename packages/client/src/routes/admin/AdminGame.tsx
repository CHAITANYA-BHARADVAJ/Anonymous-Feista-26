import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon } from 'react-leaflet';
import { MapResizer } from '../../components/MapResizer';
import { SDMCET_CENTER, SDMCET_MAX_BOUNDS, SDMCET_CAMPUS_POLYGON, SATELLITE_SOURCES } from '../../lib/mapConfig';
import 'leaflet/dist/leaflet.css';

export default function AdminGame() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [nudgeTeamId, setNudgeTeamId] = useState<number | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState('');
  const [actionLoadingTeamId, setActionLoadingTeamId] = useState<number | null>(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');

  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;

  useEffect(() => {
    reload();
    const socket = getSocket();
    socket.on('game:status_changed', (data: any) =>
      setGame((g: any) => (g ? { ...g, ...data } : g)),
    );
    socket.on('sos:received', (alert: any) => setSos((prev) => [alert, ...prev]));
    socket.on('admin:team_location', ({ teamId, lat, lng }: any) =>
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, _lat: lat, _lng: lng, _updatedAt: new Date() } : t)),
      ),
    );
    socket.on('team:checkpoint_reached', () => {
      reload();
    });
    return () => {
      socket.off('game:status_changed');
      socket.off('sos:received');
      socket.off('admin:team_location');
      socket.off('team:checkpoint_reached');
    };
  }, []);

  async function reload() {
    try {
      const [games, teamsData, sosData] = await Promise.all([
        api.getGames(),
        api.getAdminTeams(),
        api.getSosAlerts(),
      ]);
      const activeGame = games[0] ?? null;
      setGame(activeGame);
      setTeams(teamsData);
      setSos(sosData);

      if (activeGame) {
        const [lvlData, znData] = await Promise.all([
          api.getLevels(activeGame.id),
          api.getZones(activeGame.id),
        ]);
        setLevels(lvlData);
        setZones(znData);
      }
    } catch (err) {
      console.error('Error reloading admin state:', err);
    }
  }

  async function action(act: string) {
    if (!game) return;
    if (act === 'end' && !confirm('Are you sure you want to END the game for all teams?')) return;
    setLoading(true);
    try {
      await api.patchGameStatus(game.id, act);
      await reload();
    } finally {
      setLoading(false);
    }
  }

  async function broadcast() {
    if (!game || !announcement.trim()) return;
    await api.sendAnnouncement(game.id, announcement.trim(), 'broadcast');
    setAnnouncement('');
    alert('Announcement broadcast to all participant devices!');
  }

  async function sendNudge() {
    if (!game || !nudgeMsg.trim() || !nudgeTeamId) return;
    await api.sendAnnouncement(game.id, nudgeMsg.trim(), 'nudge', nudgeTeamId);
    setNudgeMsg('');
    setNudgeTeamId(null);
  }

  // 1-Click Verification of in-person photo at Start Venue
  async function handleVerifyFinish(teamId: number, teamName: string) {
    if (!confirm(`Confirm photo verification for "${teamName}" at Start Venue? This records their official finish time and rank!`)) return;
    setActionLoadingTeamId(teamId);
    try {
      await api.verifyTeamFinish(teamId);
      await reload();
      alert(`🎉 ${teamName} verified and official finish time recorded!`);
    } catch (err: any) {
      alert(err.message ?? 'Verification failed');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  // Emergency Failsafe: Force unlock next clue
  async function handleForceUnlock(teamId: number, teamName: string) {
    if (!confirm(`Emergency override: Force unlock next level for "${teamName}"?`)) return;
    setActionLoadingTeamId(teamId);
    try {
      await api.forceUnlockLevel(teamId);
      await reload();
      alert(`Next level unlocked for ${teamName}!`);
    } catch (err: any) {
      alert(err.message ?? 'Could not unlock level');
    } finally {
      setActionLoadingTeamId(null);
    }
  }

  const statusColor: Record<string, string> = {
    idle: 'bg-gray-700 text-gray-200',
    running: 'bg-green-700 text-green-100',
    paused: 'bg-yellow-700 text-yellow-100',
    ended: 'bg-red-800 text-red-100',
  };

  return (
    <div className="p-4 flex flex-col gap-6 pb-12 max-w-5xl mx-auto">
      {/* Game Control & Status Bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-white">{game?.name ?? 'Campus Hunt'}</h2>
              {game && (
                <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${statusColor[game.status]}`}>
                  {game.status}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              SDMCET Campus Open-Air Event • Real-time GPS Geofencing Active
            </p>
          </div>

          {game && (
            <div className="flex flex-wrap items-center gap-2">
              {game.status === 'idle' && (
                <button
                  onClick={() => action('start')}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-green-600/30 transition-all min-h-[44px]"
                >
                  ▶ Start Event
                </button>
              )}
              {game.status === 'running' && (
                <button
                  onClick={() => action('pause')}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-yellow-600/30 transition-all min-h-[44px]"
                >
                  ⏸ Pause Timers
                </button>
              )}
              {game.status === 'paused' && (
                <button
                  onClick={() => action('resume')}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-green-600/30 transition-all min-h-[44px]"
                >
                  ▶ Resume Event
                </button>
              )}
              {(game.status === 'running' || game.status === 'paused') && (
                <button
                  onClick={() => action('end')}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 active:scale-95 text-white font-bold text-sm shadow-lg shadow-red-700/30 transition-all min-h-[44px]"
                >
                  🏁 End Game
                </button>
              )}
              {game.status === 'ended' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Start a fresh run of the event for all teams?')) action('start');
                    }}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-green-600/30 transition-all min-h-[44px]"
                  >
                    ▶ Launch New Hunt
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Reset event status to idle?')) action('reset');
                    }}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 font-semibold text-sm border border-gray-700 transition-all min-h-[44px]"
                  >
                    🔄 Reset to Idle
                  </button>
                </div>
              )}
              {game.status !== 'ended' && (
                <button
                  onClick={() => {
                    if (confirm('Reset event state back to idle? This will clear all team progress and timer state.')) {
                      action('reset');
                    }
                  }}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold text-xs border border-gray-700 transition-all"
                  title="Reset Event State"
                >
                  🔄 Reset
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live Broadcast Input */}
        {game && (
          <div className="mt-4 pt-4 border-t border-gray-800 flex gap-2">
            <input
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="📢 Broadcast live announcement to all participants' phones…"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-white text-sm focus:outline-none focus:border-brand-400"
            />
            <button
              onClick={broadcast}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-95 text-white text-sm font-bold shadow-md shadow-brand-600/30 min-h-[44px]"
            >
              Broadcast
            </button>
          </div>
        )}
      </div>

      {/* SOS Emergency Alerts Banner */}
      {sos.length > 0 && (
        <div className="bg-red-950/80 border-2 border-red-600 rounded-3xl p-5 shadow-2xl animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🚨</span>
            <h3 className="text-lg font-black text-red-300 uppercase tracking-wider">
              Emergency SOS Alerts ({sos.length})
            </h3>
          </div>
          <div className="space-y-2">
            {sos.slice(0, 5).map((s) => (
              <div key={s.id} className="bg-black/60 rounded-xl p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-white">{s.team?.name}</span>
                  <span className="text-gray-400 text-xs ml-3">
                    GPS: {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                  </span>
                </div>
                <span className="text-xs text-red-300 font-mono">
                  {new Date(s.sentAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Campus Map Overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗺</span>
            <h3 className="font-bold text-white text-base">Live SDMCET Campus Radar</h3>
            <span className="text-xs text-gray-400 font-mono">
              ({teams.filter((t) => t._lat).length} live pins)
            </span>
          </div>

          {/* Quick Satellite Provider Switcher */}
          <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-xl border border-gray-700">
            <button
              onClick={() => setSelectedSourceKey('google')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedSourceKey === 'google' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Google Sat
            </button>
            <button
              onClick={() => setSelectedSourceKey('google_hybrid')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedSourceKey === 'google_hybrid' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sat + Roads
            </button>
            <button
              onClick={() => setSelectedSourceKey('esri')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedSourceKey === 'esri' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Esri
            </button>
          </div>
        </div>

        <div className="h-96 w-full rounded-2xl overflow-hidden border border-gray-800 relative">
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

            {/* Clue Drop Points */}
            {levels.map((lvl) => {
              if (lvl.targetLat == null || lvl.targetLng == null) return null;
              return (
                <Circle
                  key={`clue-${lvl.id}`}
                  center={[lvl.targetLat, lvl.targetLng]}
                  radius={lvl.triggerRadiusMeters ?? 25}
                  pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.2 }}
                />
              );
            })}

            {/* Zones */}
            {zones.map((zone) => {
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
                      fillOpacity: zone.kind === 'restricted' ? 0.3 : 0.1,
                    }}
                  />
                );
              } catch {
                return null;
              }
            })}

            {/* Teams Live Pins */}
            {teams.map((t) => {
              const lat = t._lat ?? t.locations?.[0]?.lat;
              const lng = t._lng ?? t.locations?.[0]?.lng;
              if (!lat || !lng) return null;
              return (
                <Marker key={`team-${t.id}`} position={[lat, lng]}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-bold">{t.name}</p>
                      <p className="text-gray-500">
                        Level {t.levelProgress?.[0]?.level?.orderIndex ?? 1}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Live Teams Operations & Finish Verification */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-white text-lg">Participating Teams ({teams.length})</h3>
            <p className="text-xs text-gray-400">
              When teams arrive at the Start Venue with their photo, click <strong>"Verify Photo & Finish"</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/admin/teams"
              className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs text-white font-bold flex items-center gap-1 shadow-md shadow-brand-600/30 transition-all min-h-[36px]"
            >
              <span>➕</span>
              <span>Register Team</span>
            </NavLink>
            <button
              onClick={reload}
              className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 font-semibold min-h-[36px]"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {teams.map((t) => {
            const currentLevel = t.levelProgress?.[0]?.level?.orderIndex ?? 1;
            const isFinished = !!t.finishedAt;
            const hints = t.penalties?.filter((p: any) => p.kind === 'hint').length ?? 0;
            const isLoadingThis = actionLoadingTeamId === t.id;

            return (
              <div
                key={t.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 border transition-all ${
                  isFinished
                    ? 'bg-green-950/40 border-green-600/60'
                    : 'bg-gray-950/70 border-gray-800'
                }`}
              >
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white text-base">{t.name}</p>
                    {isFinished && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500 text-black font-extrabold uppercase">
                        Finished 🏁
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Current Level: <span className="font-bold text-brand-300">Level {currentLevel}</span>
                    {hints > 0 && <span className="text-yellow-400 ml-2">({hints} hint penalties)</span>}
                  </p>
                </div>

                {/* Operations & Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {!isFinished ? (
                    <>
                      <button
                        onClick={() => handleVerifyFinish(t.id, t.name)}
                        disabled={isLoadingThis}
                        className="px-4 py-2.5 bg-green-600 hover:bg-green-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-green-600/30 transition-all min-h-[40px] flex items-center gap-1.5"
                      >
                        <span>✅</span>
                        <span>{isLoadingThis ? 'Verifying…' : 'Verify Photo & Finish'}</span>
                      </button>

                      <button
                        onClick={() => handleForceUnlock(t.id, t.name)}
                        disabled={isLoadingThis}
                        className="px-3 py-2 bg-yellow-600/80 hover:bg-yellow-600 active:scale-95 text-yellow-100 font-bold text-xs rounded-xl transition-all min-h-[40px]"
                        title="Emergency override: Unlock next clue"
                      >
                        🔓 Force Unlock
                      </button>

                      <button
                        onClick={() => setNudgeTeamId(t.id)}
                        className="px-3 py-2 bg-brand-900 hover:bg-brand-800 text-brand-300 font-bold text-xs rounded-xl transition-all min-h-[40px]"
                      >
                        ⚡ Nudge
                      </button>
                    </>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs text-green-300 font-mono font-semibold">
                        Finished: {new Date(t.finishedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nudge Modal */}
      {nudgeTeamId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-white text-lg mb-1">
              Nudge {teams.find((t) => t.id === nudgeTeamId)?.name}
            </h3>
            <p className="text-xs text-gray-400 mb-4">Send a quick direction hint to their screen:</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {['🔥 Getting warmer!', '❄️ Getting colder…', '🎯 Very close!', '👀 Look around you'].map((msg) => (
                <button
                  key={msg}
                  onClick={() => setNudgeMsg(msg)}
                  className={`p-2.5 rounded-xl text-xs font-semibold text-center border transition-all ${
                    nudgeMsg === msg
                      ? 'border-brand-400 bg-brand-900/60 text-white'
                      : 'border-gray-800 bg-gray-950 text-gray-300'
                  }`}
                >
                  {msg}
                </button>
              ))}
            </div>

            <input
              value={nudgeMsg}
              onChange={(e) => setNudgeMsg(e.target.value)}
              placeholder="Or type custom hint…"
              className="w-full px-3 py-2.5 mb-4 rounded-xl bg-gray-950 border border-gray-700 text-white text-xs focus:outline-none focus:border-brand-400"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setNudgeTeamId(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={sendNudge}
                disabled={!nudgeMsg.trim()}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold"
              >
                Send Nudge 🚀
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
