import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup, useMapEvents } from 'react-leaflet';
import { MapResizer } from '../../components/MapResizer';
import { SDMCET_CENTER, SDMCET_MAX_BOUNDS, SDMCET_CAMPUS_POLYGON, SATELLITE_SOURCES } from '../../lib/mapConfig';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Map click listener component to pick coordinates visually
function MapClickHandler({
  selectedLevel,
  onCoordinatePicked,
}: {
  selectedLevel: any;
  onCoordinatePicked: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (selectedLevel) {
        onCoordinatePicked(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    },
  });
  return null;
}

export default function AdminLevels() {
  const [game, setGame] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');
  const [campusMapUrl, setCampusMapUrl] = useState('');
  const [isSavingMapUrl, setIsSavingMapUrl] = useState(false);

  const activeSource = SATELLITE_SOURCES[selectedSourceKey] ?? SATELLITE_SOURCES.google;

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      const games = await api.getGames();
      const activeGame = games[0] ?? null;
      setGame(activeGame);
      if (activeGame) {
        setCampusMapUrl(activeGame.campusMapUrl ?? '');
        const [lvlData, znData] = await Promise.all([
          api.getLevels(activeGame.id),
          api.getZones(activeGame.id),
        ]);
        setLevels(lvlData);
        setZones(znData);

        if (lvlData.length > 0 && !selectedLevelId) {
          selectLevel(lvlData[0]);
        }
      }
    } catch (err) {
      console.error('Error loading levels & zones:', err);
    }
  }

  function selectLevel(lvl: any) {
    setSelectedLevelId(lvl.id);
    setEditForm({
      ...lvl,
      targetLat: lvl.targetLat ?? SDMCET_CENTER[0],
      targetLng: lvl.targetLng ?? SDMCET_CENTER[1],
      triggerRadiusMeters: lvl.triggerRadiusMeters ?? 25,
    });
  }

  function handleMapCoordinatePick(lat: number, lng: number) {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      targetLat: lat,
      targetLng: lng,
    }));
  }

  async function handleSaveLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm || !game) return;
    setIsSaving(true);
    try {
      if (editForm.id) {
        await api.updateLevel(editForm.id, {
          title: editForm.title,
          orderIndex: Number(editForm.orderIndex),
          clueText: editForm.clueText,
          locationHint: editForm.locationHint,
          answer: editForm.answer,
          targetLat: editForm.targetLat ? Number(editForm.targetLat) : null,
          targetLng: editForm.targetLng ? Number(editForm.targetLng) : null,
          triggerRadiusMeters: Number(editForm.triggerRadiusMeters ?? 25),
          durationSecs: editForm.durationSecs ? Number(editForm.durationSecs) : null,
          isFinal: Boolean(editForm.isFinal),
        });
        alert('Level saved successfully!');
      } else {
        await api.createLevel(game.id, {
          title: editForm.title,
          orderIndex: Number(editForm.orderIndex),
          clueText: editForm.clueText,
          locationHint: editForm.locationHint,
          answer: editForm.answer,
          targetLat: editForm.targetLat ? Number(editForm.targetLat) : null,
          targetLng: editForm.targetLng ? Number(editForm.targetLng) : null,
          triggerRadiusMeters: Number(editForm.triggerRadiusMeters ?? 25),
          durationSecs: editForm.durationSecs ? Number(editForm.durationSecs) : null,
          isFinal: Boolean(editForm.isFinal),
        });
        alert('New level created!');
      }
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to save level');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLevel(id: number) {
    if (!confirm('Are you sure you want to delete this level?')) return;
    try {
      await api.deleteLevel(id);
      setSelectedLevelId(null);
      setEditForm(null);
      await reload();
      alert('Level deleted.');
    } catch (err: any) {
      alert(err.message ?? 'Cannot delete level');
    }
  }

  function handleAddNewLevel() {
    const nextOrder = levels.length + 1;
    const newLvl = {
      title: `Level ${nextOrder}`,
      orderIndex: nextOrder,
      clueText: '',
      locationHint: '',
      answer: '',
      targetLat: SDMCET_CENTER[0],
      targetLng: SDMCET_CENTER[1],
      triggerRadiusMeters: 25,
      durationSecs: 1800,
      isFinal: false,
    };
    setSelectedLevelId(null);
    setEditForm(newLvl);
  }

  async function handleSaveCampusMapUrl() {
    if (!game) return;
    setIsSavingMapUrl(true);
    try {
      await api.updateMapSettings({ campusMapUrl });
      alert('Campus overlay map URL updated!');
    } catch (err: any) {
      alert(err.message ?? 'Failed to update map settings');
    } finally {
      setIsSavingMapUrl(false);
    }
  }

  return (
    <div className="p-4 flex flex-col gap-6 pb-16 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">🗺 Map & Clues Builder</h2>
          <p className="text-xs text-gray-400 mt-1">
            Click anywhere on the SDMCET map to set or move clue drop coordinates. Adjust radius & clues below.
          </p>
        </div>

        {/* Map Type Switcher */}
        <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-xl border border-gray-700">
          <button
            onClick={() => setSelectedSourceKey('google')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedSourceKey === 'google' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Google Sat
          </button>
          <button
            onClick={() => setSelectedSourceKey('google_hybrid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedSourceKey === 'google_hybrid' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Sat + Roads
          </button>
          <button
            onClick={() => setSelectedSourceKey('esri')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedSourceKey === 'esri' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Esri
          </button>
          <button
            onClick={() => setSelectedSourceKey('osm')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedSourceKey === 'osm' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Street
          </button>
        </div>
      </div>

      {/* Main Grid: Visual Map + Level Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Map Area (7 cols on desktop) */}
        <div className="lg:col-span-7 bg-gray-900 border border-gray-800 rounded-3xl p-4 shadow-xl flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              {editForm
                ? `📍 Click map to place: ${editForm.title}`
                : 'Select a level to mark location'}
            </span>
            {editForm && (
              <span className="text-[11px] bg-brand-900 text-brand-300 px-2.5 py-0.5 rounded-full font-mono font-semibold">
                Radius: {editForm.triggerRadiusMeters ?? 25}m
              </span>
            )}
          </div>

          <div className="h-[480px] w-full rounded-2xl overflow-hidden border border-gray-800 relative cursor-crosshair">
            <MapContainer
              center={SDMCET_CENTER}
              zoom={18}
              minZoom={15}
              maxZoom={20}
              maxBounds={SDMCET_MAX_BOUNDS}
              maxBoundsViscosity={0.7}
              className="h-full w-full"
              zoomControl={true}
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

              {/* Map Click Handler */}
              <MapClickHandler
                selectedLevel={editForm}
                onCoordinatePicked={handleMapCoordinatePick}
              />

              {/* Active Clue Geofence Circles */}
              {levels.map((lvl) => {
                if (lvl.targetLat == null || lvl.targetLng == null) return null;
                const isSelected = selectedLevelId === lvl.id;
                return (
                  <div key={lvl.id}>
                    <Circle
                      center={[lvl.targetLat, lvl.targetLng]}
                      radius={lvl.triggerRadiusMeters ?? 25}
                      pathOptions={{
                        color: isSelected ? '#4f46e5' : '#f59e0b',
                        fillColor: isSelected ? '#4f46e5' : '#f59e0b',
                        fillOpacity: isSelected ? 0.35 : 0.15,
                        weight: isSelected ? 3 : 1.5,
                      }}
                    />
                    <Marker position={[lvl.targetLat, lvl.targetLng]}>
                      <Popup>
                        <div className="text-xs">
                          <p className="font-bold">{lvl.title}</p>
                          <p className="text-gray-500">Order: #{lvl.orderIndex}</p>
                          <p className="text-gray-500">Radius: {lvl.triggerRadiusMeters ?? 25}m</p>
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                );
              })}

              {/* Currently Editing Unsaved Position Marker */}
              {editForm && editForm.targetLat && editForm.targetLng && (
                <Circle
                  center={[editForm.targetLat, editForm.targetLng]}
                  radius={Number(editForm.triggerRadiusMeters ?? 25)}
                  pathOptions={{
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 0.25,
                    dashArray: '6 6',
                    weight: 2,
                  }}
                />
              )}

              {/* Campus Zones */}
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
                        fillOpacity: zone.kind === 'restricted' ? 0.3 : 0.08,
                      }}
                    />
                  );
                } catch {
                  return null;
                }
              })}
            </MapContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 px-2">
            <span>💡 Click anywhere on the map to set target GPS position.</span>
            <div className="flex gap-3">
              <span><span className="text-amber-400">●</span> Clue Drop</span>
              <span><span className="text-emerald-400">■</span> Play Boundary</span>
              <span><span className="text-red-400">■</span> Restricted</span>
            </div>
          </div>
        </div>

        {/* Levels Sidebar & Editor (5 cols on desktop) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Levels List Selector */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-base">Levels ({levels.length})</h3>
              <button
                onClick={handleAddNewLevel}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow transition-all"
              >
                + Add Level
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {levels.map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => selectLevel(lvl)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    selectedLevelId === lvl.id
                      ? 'bg-brand-600 border-brand-400 text-white shadow'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  #{lvl.orderIndex} {lvl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Edit Form */}
          {editForm && (
            <form onSubmit={handleSaveLevel} className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="font-bold text-white text-base">
                  {editForm.id ? `Edit Level #${editForm.orderIndex}` : 'New Level'}
                </h3>
                {editForm.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteLevel(editForm.id)}
                    className="text-red-400 hover:text-red-300 text-xs font-bold"
                  >
                    Delete Level
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Clue Text (Revealed on Arrival)</label>
                <textarea
                  value={editForm.clueText}
                  onChange={(e) => setEditForm({ ...editForm, clueText: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Location Guidance Hint</label>
                <input
                  type="text"
                  value={editForm.locationHint}
                  onChange={(e) => setEditForm({ ...editForm, locationHint: e.target.value })}
                  placeholder="e.g. Near main library entrance lawn"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Secret Answer</label>
                  <input
                    type="text"
                    value={editForm.answer}
                    onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                    placeholder="e.g. anonymous"
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Trigger Radius (Meters)</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={editForm.triggerRadiusMeters ?? 25}
                    onChange={(e) => setEditForm({ ...editForm, triggerRadiusMeters: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-gray-950 p-3 rounded-xl border border-gray-800">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-0.5">Target Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editForm.targetLat ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, targetLat: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-0.5">Target Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={editForm.targetLng ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, targetLng: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFinal"
                  checked={Boolean(editForm.isFinal)}
                  onChange={(e) => setEditForm({ ...editForm, isFinal: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-brand-500 w-4 h-4"
                />
                <label htmlFor="isFinal" className="text-xs font-semibold text-gray-200">
                  This is the Grand Finale level (race to Start Venue for in-person verification)
                </label>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-brand-600/30 transition-all min-h-[44px]"
              >
                {isSaving ? 'Saving Changes…' : '💾 Save Level Configuration'}
              </button>
            </form>
          )}

          {/* Campus Map Graphic Overlay Configuration */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="font-bold text-white text-sm">🏛 Custom SDMCET Map Graphic Overlay</h3>
            <p className="text-xs text-gray-400">
              If you have a campus blueprint or illustrated map image, paste its URL here to overlay it on top of the satellite/street map:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={campusMapUrl}
                onChange={(e) => setCampusMapUrl(e.target.value)}
                placeholder="https://.../sdmcet-campus-blueprint.png"
                className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveCampusMapUrl}
                disabled={isSavingMapUrl}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
              >
                {isSavingMapUrl ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
