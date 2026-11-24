import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup, useMapEvents } from 'react-leaflet';
import { MapResizer } from '../../components/MapResizer';
import { SDMCET_CENTER, SDMCET_MAX_BOUNDS, SDMCET_CAMPUS_POLYGON, SATELLITE_SOURCES } from '../../lib/mapConfig';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom icons
const targetPinIcon = L.divIcon({
  className: 'custom-admin-target-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-8 h-8 rounded-full bg-cyan-400/30 animate-ping"></div>
    <div class="w-6 h-6 rounded-full bg-cyan-400 border-2 border-zinc-950 shadow-2xl flex items-center justify-center text-xs text-zinc-950 font-black font-mono">📍</div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const poolPinIcon = L.divIcon({
  className: 'custom-admin-pool-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="w-6 h-6 rounded-full bg-amber-400 border-2 border-zinc-950 shadow-md flex items-center justify-center text-xs text-zinc-950 font-mono font-bold">★</div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export interface PoolClue {
  id: string;
  title: string;
  clueText: string;
  locationHint: string;
  answer: string;
  targetLat: number | null;
  targetLng: number | null;
  triggerRadiusMeters: number;
  durationSecs?: number;
  isFinal: boolean;
  hints: Array<{ text: string; penaltyMins: number }>;
  socialLinks?: Array<{ platform: string; url: string }>;
}

// Helper: Convert center (lat, lng) and radius into 16-point GeoJSON Polygon coordinates
function circleToPolygonCoordinates(lat: number, lng: number, radiusMeters: number, points = 16): [number, number][] {
  const coords: [number, number][] = [];
  const R = 6378137; // Earth's radius in meters
  const dLat = radiusMeters / R;
  const dLng = radiusMeters / (R * Math.cos((Math.PI * lat) / 180));

  for (let i = 0; i < points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const pLat = lat + (dLat * Math.sin(angle) * 180) / Math.PI;
    const pLng = lng + (dLng * Math.cos(angle) * 180) / Math.PI;
    coords.push([pLng, pLat]); // GeoJSON is [lng, lat]
  }
  coords.push(coords[0]); // Close ring
  return coords;
}

// Map Click Listener
function MapStudioClickHandler({
  studioMode,
  onTargetPicked,
  onZonePointAdded,
  onPoolTargetPicked,
}: {
  studioMode: 'level' | 'pool' | 'zones';
  onTargetPicked: (lat: number, lng: number) => void;
  onZonePointAdded: (lat: number, lng: number) => void;
  onPoolTargetPicked: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      if (studioMode === 'level') {
        onTargetPicked(lat, lng);
      } else if (studioMode === 'pool') {
        onPoolTargetPicked(lat, lng);
      } else {
        onZonePointAdded(lat, lng);
      }
    },
  });
  return null;
}

// Campus Landmarks Presets for 1-Click Placement
const SDMCET_PRESETS = [
  { name: 'Main Library / Admin', lat: 15.4294, lng: 75.0135 },
  { name: 'Canteen Lawn', lat: 15.4282, lng: 75.0152 },
  { name: 'Amphitheatre (Finale)', lat: 15.4272, lng: 75.0146 },
  { name: 'Science Block', lat: 15.4289, lng: 75.0142 },
  { name: 'Civil / Workshop', lat: 15.4268, lng: 75.0158 },
];

export default function AdminLevels() {
  const [game, setGame] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);

  // Studio Mode: 'level' (objectives) | 'pool' (create & manage clue pool) | 'zones' (hazard & boundary zones)
  const [studioMode, setStudioMode] = useState<'level' | 'pool' | 'zones'>('level');

  // Clue Pool State
  const [poolClues, setPoolClues] = useState<PoolClue[]>(() => {
    try {
      const saved = localStorage.getItem('ch-custom-clue-pool');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [editingPoolClue, setEditingPoolClue] = useState<PoolClue | null>(null);
  const [poolSearch, setPoolSearch] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  // Level Edit Form State
  const [editForm, setEditForm] = useState<any>(null);
  const [hintsList, setHintsList] = useState<Array<{ id?: number; text: string; penaltyMins: number }>>([
    { text: '', penaltyMins: 2 },
    { text: '', penaltyMins: 4 },
    { text: '', penaltyMins: 6 },
  ]);
  const [socialLinksList, setSocialLinksList] = useState<Array<{ platform: string; url: string }>>([]);
  const [isSavingLevel, setIsSavingLevel] = useState(false);
  const [deleteConfirmLevel, setDeleteConfirmLevel] = useState<any | null>(null);

  // Zone Creation State
  const [zoneKind, setZoneKind] = useState<'restricted' | 'permitted'>('restricted');
  const [zoneDrawType, setZoneDrawType] = useState<'quick_radius' | 'custom_polygon'>('quick_radius');
  const [zoneCenter, setZoneCenter] = useState<[number, number] | null>(null);
  const [zoneRadiusMeters, setZoneRadiusMeters] = useState<number>(35);
  const [zonePolygonPoints, setZonePolygonPoints] = useState<[number, number][]>([]);
  const [zoneLabel, setZoneLabel] = useState<string>('');
  const [zonePenaltyMins, setZonePenaltyMins] = useState<number>(5);
  const [isSavingZone, setIsSavingZone] = useState(false);

  // Map Tile Source
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('google');
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
        const [lvlData, znData] = await Promise.all([
          api.getLevels(activeGame.id),
          api.getZones(activeGame.id),
        ]);
        const sorted = lvlData.sort((a, b) => a.orderIndex - b.orderIndex);
        setLevels(sorted);
        setZones(znData);

        if (sorted.length > 0 && !selectedLevelId) {
          selectLevel(sorted[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load levels & zones:', err);
    }
  }

  function savePoolClues(clues: PoolClue[]) {
    try {
      localStorage.setItem('ch-custom-clue-pool', JSON.stringify(clues));
    } catch (e) {
      console.error('Failed to save clue pool', e);
    }
  }

  function selectLevel(lvl: any) {
    setSelectedLevelId(lvl.id);
    setEditForm({
      ...lvl,
      targetLat: lvl.targetLat ?? SDMCET_CENTER[0],
      targetLng: lvl.targetLng ?? SDMCET_CENTER[1],
      triggerRadiusMeters: lvl.triggerRadiusMeters ?? 25,
      answer: lvl.answer ?? '',
      locationHint: lvl.locationHint ?? '',
      clueText: lvl.clueText ?? '',
      isFinal: Boolean(lvl.isFinal),
    });

    const existingHints = (lvl.hints ?? []).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
    setHintsList([
      { text: existingHints[0]?.text ?? '', penaltyMins: existingHints[0]?.penaltyMins ?? 2 },
      { text: existingHints[1]?.text ?? '', penaltyMins: existingHints[1]?.penaltyMins ?? 4 },
      { text: existingHints[2]?.text ?? '', penaltyMins: existingHints[2]?.penaltyMins ?? 6 },
    ]);
    setSocialLinksList(lvl.socialLinks ? lvl.socialLinks.map((s: any) => ({ platform: s.platform || 'Social Intel', url: s.url })) : []);
  }

  function handleCreateNewLevel() {
    const nextOrder = levels.length + 1;
    const newLvl = {
      title: `Stage ${nextOrder}`,
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
    setHintsList([
      { text: '', penaltyMins: 2 },
      { text: '', penaltyMins: 4 },
      { text: '', penaltyMins: 6 },
    ]);
    setSocialLinksList([]);
  }

  function handleMapTargetPicked(lat: number, lng: number) {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      targetLat: lat,
      targetLng: lng,
    }));
  }

  function handlePoolTargetPicked(lat: number, lng: number) {
    if (editingPoolClue) {
      setEditingPoolClue((prev) => (prev ? { ...prev, targetLat: lat, targetLng: lng } : null));
    }
  }

  function handleZonePointAdded(lat: number, lng: number) {
    if (zoneDrawType === 'quick_radius') {
      setZoneCenter([lat, lng]);
    } else {
      setZonePolygonPoints((prev) => [...prev, [lat, lng]]);
    }
  }

  async function handleSaveLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm || !game) return;
    setIsSavingLevel(true);

    try {
      const payload = {
        title: editForm.title.trim(),
        orderIndex: Number(editForm.orderIndex),
        clueText: editForm.clueText.trim(),
        locationHint: editForm.locationHint.trim(),
        answer: editForm.answer ? editForm.answer.trim() : '',
        targetLat: editForm.targetLat ? Number(editForm.targetLat) : null,
        targetLng: editForm.targetLng ? Number(editForm.targetLng) : null,
        triggerRadiusMeters: Number(editForm.triggerRadiusMeters ?? 25),
        durationSecs: editForm.durationSecs ? Number(editForm.durationSecs) : null,
        isFinal: Boolean(editForm.isFinal),
        hints: hintsList.filter((h) => h.text.trim().length > 0),
        socialLinks: socialLinksList.filter((s) => s.url.trim().length > 0),
      };

      if (editForm.id) {
        await api.updateLevel(editForm.id, payload);
      } else {
        await api.createLevel(game.id, payload);
      }

      await reload();
      alert('✓ Objective saved successfully!');
    } catch (err: any) {
      alert(err.message ?? 'Failed to save objective');
    } finally {
      setIsSavingLevel(false);
    }
  }

  async function handleDeleteLevel(lvl: any) {
    try {
      await api.deleteLevel(lvl.id);
      setDeleteConfirmLevel(null);
      if (selectedLevelId === lvl.id) {
        setSelectedLevelId(null);
        setEditForm(null);
      }
      await reload();
      alert(`✓ Stage #${lvl.orderIndex} deleted.`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete stage');
    }
  }

  async function handleMoveLevel(levelId: number, direction: 'up' | 'down') {
    const idx = levels.findIndex((l) => l.id === levelId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === levels.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const currentLvl = levels[idx];
    const targetLvl = levels[swapIdx];

    try {
      await Promise.all([
        api.updateLevel(currentLvl.id, { orderIndex: targetLvl.orderIndex }),
        api.updateLevel(targetLvl.id, { orderIndex: currentLvl.orderIndex }),
      ]);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to reorder stage');
    }
  }

  // Clue Pool Handlers
  function handleOpenCreatePoolClue() {
    setEditingPoolClue({
      id: `pool-${Date.now()}`,
      title: `Pool Landmark ${poolClues.length + 1}`,
      clueText: '',
      locationHint: '',
      answer: '',
      targetLat: SDMCET_CENTER[0],
      targetLng: SDMCET_CENTER[1],
      triggerRadiusMeters: 25,
      isFinal: false,
      hints: [
        { text: '', penaltyMins: 2 },
        { text: '', penaltyMins: 4 },
        { text: '', penaltyMins: 6 },
      ],
      socialLinks: [],
    });
  }

  function handleSavePoolClue(clue: PoolClue) {
    if (!clue.title.trim()) {
      alert('Please enter a title for the clue.');
      return;
    }

    const idx = poolClues.findIndex((c) => c.id === clue.id);
    let updated: PoolClue[];
    if (idx >= 0) {
      updated = [...poolClues];
      updated[idx] = clue;
    } else {
      updated = [...poolClues, clue];
    }

    setPoolClues(updated);
    savePoolClues(updated);
    if (!selectedPoolIds.includes(clue.id)) {
      setSelectedPoolIds((prev) => [...prev, clue.id]);
    }
    setEditingPoolClue(null);
  }

  function handleDeletePoolClue(id: string) {
    if (!confirm('Remove this clue from your pool?')) return;
    const updated = poolClues.filter((c) => c.id !== id);
    setPoolClues(updated);
    savePoolClues(updated);
    setSelectedPoolIds((prev) => prev.filter((i) => i !== id));
    if (editingPoolClue?.id === id) {
      setEditingPoolClue(null);
    }
  }

  function handleImportFromActiveGame() {
    if (levels.length === 0) {
      alert('No active stages to import. Create stages in the Objectives tab first.');
      return;
    }

    const imported: PoolClue[] = levels.map((lvl) => ({
      id: `pool-${lvl.id}-${Date.now()}`,
      title: lvl.title,
      clueText: lvl.clueText || '',
      locationHint: lvl.locationHint || '',
      answer: lvl.answer || '',
      targetLat: lvl.targetLat,
      targetLng: lvl.targetLng,
      triggerRadiusMeters: lvl.triggerRadiusMeters ?? 25,
      isFinal: Boolean(lvl.isFinal),
      hints: (lvl.hints || []).map((h: any) => ({ text: h.text, penaltyMins: h.penaltyMins })),
      socialLinks: (lvl.socialLinks || []).map((s: any) => ({ platform: s.platform, url: s.url })),
    }));

    const existingTitles = new Set(poolClues.map((c) => c.title.toLowerCase().trim()));
    const newItems = imported.filter((c) => !existingTitles.has(c.title.toLowerCase().trim()));

    if (newItems.length === 0) {
      alert('All active game objectives already exist in your Clue Pool.');
      return;
    }

    const updated = [...poolClues, ...newItems];
    setPoolClues(updated);
    savePoolClues(updated);
    alert(`✓ Imported ${newItems.length} clues into your Clue Pool!`);
  }

  function togglePoolSelection(id: string) {
    setSelectedPoolIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  async function handleDeploySelectedPool() {
    if (!game) return;
    const selected = poolClues.filter((c) => selectedPoolIds.includes(c.id));
    if (selected.length === 0) {
      alert('Please select at least 1 clue from your pool to deploy.');
      return;
    }

    const ok = confirm(
      `Deploy ${selected.length} selected clue(s) into the active game?\nThis will configure ${selected.length} stages for current gameplay.`,
    );
    if (!ok) return;

    setIsDeploying(true);
    try {
      const res = await api.deployPool(game.id, selected);
      await reload();
      setStudioMode('level');
      alert(`✓ Successfully deployed ${res.count || selected.length} clues to the active game!`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to deploy clues');
    } finally {
      setIsDeploying(false);
    }
  }

  // Zone Save Handler
  async function handleSaveZone() {
    if (!game) return;
    if (!zoneLabel.trim()) {
      alert('Please enter a descriptive name for this zone.');
      return;
    }

    let coordinates: [number, number][] = [];

    if (zoneDrawType === 'quick_radius') {
      if (!zoneCenter) {
        alert('Please click on the map to set the center point for this zone.');
        return;
      }
      coordinates = circleToPolygonCoordinates(zoneCenter[0], zoneCenter[1], zoneRadiusMeters);
    } else {
      if (zonePolygonPoints.length < 3) {
        alert('A polygon boundary requires at least 3 points on the map. Click on the map to add points.');
        return;
      }
      coordinates = zonePolygonPoints.map(([lat, lng]) => [lng, lat]);
      coordinates.push(coordinates[0]);
    }

    setIsSavingZone(true);
    try {
      const geoJson = JSON.stringify({
        type: 'Polygon',
        coordinates: [coordinates],
      });

      await api.createZone(game.id, {
        label: zoneLabel.trim(),
        kind: zoneKind,
        geoJson,
        penaltyMins: zoneKind === 'restricted' ? zonePenaltyMins : 0,
        active: true,
      });

      setZoneLabel('');
      setZoneCenter(null);
      setZonePolygonPoints([]);
      await reload();
      alert('✓ Zone boundary saved successfully!');
    } catch (err: any) {
      alert(err.message ?? 'Failed to save zone');
    } finally {
      setIsSavingZone(false);
    }
  }

  async function handleDeleteZone(zoneId: number) {
    if (!confirm('Delete this zone boundary?')) return;
    try {
      await api.deleteZone(zoneId);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete zone');
    }
  }

  // Live preview polygon for zone drawing
  const liveZonePreviewPolygon = useMemo(() => {
    if (zoneDrawType === 'quick_radius') {
      if (!zoneCenter) return null;
      const geoCoords = circleToPolygonCoordinates(zoneCenter[0], zoneCenter[1], zoneRadiusMeters);
      return geoCoords.map(([lng, lat]) => [lat, lng] as [number, number]);
    } else {
      if (zonePolygonPoints.length < 2) return null;
      return zonePolygonPoints;
    }
  }, [zoneDrawType, zoneCenter, zoneRadiusMeters, zonePolygonPoints]);

  const filteredPoolClues = useMemo(() => {
    if (!poolSearch.trim()) return poolClues;
    const q = poolSearch.toLowerCase();
    return poolClues.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.locationHint.toLowerCase().includes(q) ||
        c.answer.toLowerCase().includes(q) ||
        c.clueText.toLowerCase().includes(q),
    );
  }, [poolClues, poolSearch]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* =========================================================================
          TOP COMMAND HEADER & TAB SELECTOR
          ========================================================================= */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>Clue & Geofence Studio</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Build active hunt stages, manage your reusable clue pool, and configure hazard geofences.
          </p>
        </div>

        {/* Clean 3-Mode Tab Selector */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => {
              setStudioMode('level');
              setEditingPoolClue(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'level'
                ? 'bg-zinc-800 text-white shadow-md border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎯</span>
            <span>Active Stages ({levels.length})</span>
          </button>

          <button
            onClick={() => setStudioMode('pool')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'pool'
                ? 'bg-zinc-800 text-amber-300 shadow-md border border-zinc-700'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            <span>🎪</span>
            <span>Clue Pool ({poolClues.length})</span>
          </button>

          <button
            onClick={() => {
              setStudioMode('zones');
              setEditingPoolClue(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'zones'
                ? 'bg-zinc-800 text-white shadow-md border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🚫</span>
            <span>Hazard Zones ({zones.length})</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN STUDIO GRID: SATELLITE MAP (LEFT) + CONFIGURATION WORKBENCH (RIGHT)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ==========================================
            LEFT: INTERACTIVE SATELLITE MAP (7 COLS)
            ========================================== */}
        <div className="lg:col-span-7 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
          {/* Map Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                {studioMode === 'level'
                  ? editForm
                    ? `Click map to position: ${editForm.title}`
                    : 'Select or create a stage'
                  : studioMode === 'pool'
                  ? editingPoolClue
                    ? `Click map to position: ${editingPoolClue.title}`
                    : 'Clue Pool Map: View landmarks or pick coordinates'
                  : 'Click map to draw zone boundaries'}
              </span>
            </div>

            {/* Satellite Switcher Pill */}
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              {[
                { id: 'google', label: 'Google Sat' },
                { id: 'google_hybrid', label: 'Sat + Roads' },
                { id: 'esri', label: 'Esri World' },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => setSelectedSourceKey(src.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                    selectedSourceKey === src.id
                      ? 'bg-zinc-800 text-white font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Landmark Presets */}
          {(studioMode === 'level' && editForm) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950/70 border border-zinc-800/80 rounded-xl">
              <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase mr-1">
                PRESETS:
              </span>
              {SDMCET_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleMapTargetPicked(p.lat, p.lng)}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-cyan-500/40 text-[10px] font-mono text-cyan-300 rounded-lg transition-all"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {(studioMode === 'pool' && editingPoolClue) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950/70 border border-zinc-800/80 rounded-xl">
              <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase mr-1">
                PRESETS:
              </span>
              {SDMCET_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handlePoolTargetPicked(p.lat, p.lng)}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-[10px] font-mono text-amber-300 rounded-lg transition-all"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Map Viewport */}
          <div className="h-[520px] w-full rounded-xl overflow-hidden border border-zinc-800 relative cursor-crosshair shadow-inner">
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

              {/* Campus Perimeter Boundary */}
              <Polygon
                positions={SDMCET_CAMPUS_POLYGON}
                pathOptions={{
                  color: '#38bdf8',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.03,
                  weight: 1.5,
                  dashArray: '4 4',
                }}
              />

              {/* Map Click Listener */}
              <MapStudioClickHandler
                studioMode={studioMode}
                onTargetPicked={handleMapTargetPicked}
                onZonePointAdded={handleZonePointAdded}
                onPoolTargetPicked={handlePoolTargetPicked}
              />

              {/* Active Stages Pins (Level Mode) */}
              {studioMode === 'level' &&
                levels.map((lvl) => {
                  if (lvl.targetLat == null || lvl.targetLng == null) return null;
                  const isSelected = selectedLevelId === lvl.id;
                  return (
                    <div key={lvl.id}>
                      <Circle
                        center={[lvl.targetLat, lvl.targetLng]}
                        radius={lvl.triggerRadiusMeters ?? 25}
                        pathOptions={{
                          color: isSelected ? '#22d3ee' : lvl.isFinal ? '#c084fc' : '#71717a',
                          fillColor: isSelected ? '#22d3ee' : lvl.isFinal ? '#c084fc' : '#71717a',
                          fillOpacity: isSelected ? 0.3 : 0.1,
                          weight: isSelected ? 2 : 1,
                        }}
                      />
                      <Marker
                        position={[lvl.targetLat, lvl.targetLng]}
                        icon={targetPinIcon}
                        eventHandlers={{
                          click: () => selectLevel(lvl),
                        }}
                      >
                        <Popup>
                          <div className="text-xs font-mono">
                            <p className="font-bold text-zinc-900">{lvl.title}</p>
                            <p className="text-zinc-600">Stage #{lvl.orderIndex}</p>
                          </div>
                        </Popup>
                      </Marker>
                    </div>
                  );
                })}

              {/* Pool Clues Pins (Pool Mode) */}
              {studioMode === 'pool' &&
                poolClues.map((clue) => {
                  if (clue.targetLat == null || clue.targetLng == null) return null;
                  const isEditing = editingPoolClue?.id === clue.id;
                  const isSelected = selectedPoolIds.includes(clue.id);

                  return (
                    <div key={clue.id}>
                      <Circle
                        center={[clue.targetLat, clue.targetLng]}
                        radius={clue.triggerRadiusMeters ?? 25}
                        pathOptions={{
                          color: isEditing ? '#10b981' : isSelected ? '#f59e0b' : '#71717a',
                          fillColor: isEditing ? '#10b981' : isSelected ? '#f59e0b' : '#71717a',
                          fillOpacity: isEditing ? 0.35 : isSelected ? 0.25 : 0.08,
                          weight: isEditing ? 2.5 : isSelected ? 2 : 1,
                        }}
                      />
                      <Marker
                        position={[clue.targetLat, clue.targetLng]}
                        icon={poolPinIcon}
                        eventHandlers={{
                          click: () => setEditingPoolClue(clue),
                        }}
                      >
                        <Popup>
                          <div className="text-xs font-mono">
                            <p className="font-bold text-zinc-900">{clue.title}</p>
                            <p className="text-zinc-600">{clue.locationHint || 'Pool Landmark'}</p>
                          </div>
                        </Popup>
                      </Marker>
                    </div>
                  );
                })}

              {/* Editing Target Pin Preview in Pool Mode */}
              {studioMode === 'pool' && editingPoolClue && editingPoolClue.targetLat && editingPoolClue.targetLng && (
                <Circle
                  center={[editingPoolClue.targetLat, editingPoolClue.targetLng]}
                  radius={editingPoolClue.triggerRadiusMeters ?? 25}
                  pathOptions={{
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 0.3,
                    dashArray: '4 4',
                    weight: 2,
                  }}
                />
              )}

              {/* Active Editing Level Target (Live Preview in Level Mode) */}
              {studioMode === 'level' && editForm && editForm.targetLat && editForm.targetLng && (
                <Circle
                  center={[editForm.targetLat, editForm.targetLng]}
                  radius={Number(editForm.triggerRadiusMeters ?? 25)}
                  pathOptions={{
                    color: '#22d3ee',
                    fillColor: '#22d3ee',
                    fillOpacity: 0.25,
                    dashArray: '4 4',
                    weight: 2,
                  }}
                />
              )}

              {/* Zones */}
              {zones.map((zone) => {
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
                        fillOpacity: isRestricted ? 0.25 : 0.1,
                        weight: 2,
                        dashArray: isRestricted ? '4 4' : undefined,
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-mono">
                          <p className="font-bold text-zinc-900">{zone.label || 'Zone'}</p>
                          <p className={isRestricted ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                            {isRestricted ? `Restricted (+${zone.penaltyMins}m penalty)` : 'Playing Area'}
                          </p>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                } catch {
                  return null;
                }
              })}

              {/* Zone Under Construction */}
              {studioMode === 'zones' && liveZonePreviewPolygon && (
                <Polygon
                  positions={liveZonePreviewPolygon}
                  pathOptions={{
                    color: zoneKind === 'restricted' ? '#f43f5e' : '#10b981',
                    fillColor: zoneKind === 'restricted' ? '#f43f5e' : '#10b981',
                    fillOpacity: 0.35,
                    weight: 2.5,
                    dashArray: '3 3',
                  }}
                />
              )}
            </MapContainer>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono">
            <span>Click map to place targets or draw boundary vertices.</span>
          </div>
        </div>

        {/* =====================================================================
            RIGHT: WORKBENCH FOR ACTIVE STAGES, CLUE POOL, OR ZONES
            ===================================================================== */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* ===================================================================
              MODE 1: ACTIVE HUNT STAGES
              =================================================================== */}
          {studioMode === 'level' && (
            <>
              {/* Stages List */}
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Hunt Stages Sequence ({levels.length})
                  </span>
                  <button
                    onClick={handleCreateNewLevel}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-xl transition-all shadow active:scale-95 flex items-center gap-1"
                  >
                    + Add Stage
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {levels.length === 0 ? (
                    <div className="py-6 text-center text-xs font-mono text-zinc-500">
                      No stages configured yet. Click "+ Add Stage" or deploy from your Clue Pool.
                    </div>
                  ) : (
                    levels.map((lvl, index) => {
                      const isSelected = selectedLevelId === lvl.id;
                      return (
                        <div
                          key={lvl.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs ${
                            isSelected
                              ? 'bg-zinc-800/90 border-cyan-400/50 text-white shadow-md'
                              : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          <div
                            onClick={() => selectLevel(lvl)}
                            className="flex items-center gap-2 flex-1 cursor-pointer truncate"
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[10px] font-black shrink-0 ${
                                isSelected ? 'bg-cyan-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {lvl.orderIndex}
                            </span>
                            <span className="font-semibold truncate">{lvl.title}</span>
                            {lvl.isFinal && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                                FINALE 🏁
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 pl-2">
                            <button
                              onClick={() => handleMoveLevel(lvl.id, 'up')}
                              disabled={index === 0}
                              className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20"
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveLevel(lvl.id, 'down')}
                              disabled={index === levels.length - 1}
                              className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20"
                              title="Move Down"
                            >
                              ▼
                            </button>
                            <button
                              onClick={() => setDeleteConfirmLevel(lvl)}
                              className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 transition-all ml-1"
                              title="Delete Stage"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Clue Editor Form */}
              {editForm && (
                <form
                  onSubmit={handleSaveLevel}
                  className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-4 shadow-xl"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      {editForm.id ? `Editing Stage 0${editForm.orderIndex}` : 'New Stage Configuration'}
                    </span>

                    {editForm.id && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmLevel(editForm)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Stage Title
                      </label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        required
                        placeholder="e.g. Main Library Entrance"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Campus Sector / Where to Go
                      </label>
                      <input
                        type="text"
                        value={editForm.locationHint}
                        onChange={(e) => setEditForm({ ...editForm, locationHint: e.target.value })}
                        placeholder="e.g. Near the north lawn entrance"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Clue / Decrypted Riddle
                      </label>
                      <textarea
                        value={editForm.clueText}
                        onChange={(e) => setEditForm({ ...editForm, clueText: e.target.value })}
                        required
                        rows={2}
                        placeholder="The operative instructions or riddle decrypted upon arriving in range…"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>

                  {/* Proximity Radius */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Unlock Proximity:</span>
                      <span className="text-cyan-300 font-bold">{editForm.triggerRadiusMeters ?? 25} meters</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="60"
                      step="5"
                      value={editForm.triggerRadiusMeters ?? 25}
                      onChange={(e) => setEditForm({ ...editForm, triggerRadiusMeters: Number(e.target.value) })}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-zinc-500">
                      Coordinates: {editForm.targetLat ? Number(editForm.targetLat).toFixed(5) : '—'}, {editForm.targetLng ? Number(editForm.targetLng).toFixed(5) : '—'} (click satellite map to adjust)
                    </span>
                  </div>

                  {/* Completion Rule */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isFinal"
                        checked={Boolean(editForm.isFinal)}
                        onChange={(e) => setEditForm({ ...editForm, isFinal: e.target.checked })}
                        className="rounded bg-zinc-900 border-zinc-700 text-purple-400"
                      />
                      <label htmlFor="isFinal" className="text-xs text-zinc-200 font-medium">
                        🏁 Mark as Grand Finale Objective (Photo Verification)
                      </label>
                    </div>

                    {editForm.isFinal ? (
                      <p className="text-[11px] text-purple-300 font-mono bg-purple-950/30 p-2 rounded-lg border border-purple-500/20">
                        Final stage sprint: Teams submit live camera photo at Amphitheatre grounds for coordinator verification.
                      </p>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Secret Passcode / Answer
                        </label>
                        <input
                          type="text"
                          value={editForm.answer}
                          onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                          placeholder="e.g. anonymous"
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-cyan-300 focus:outline-none focus:border-zinc-500 uppercase"
                        />
                      </div>
                    )}
                  </div>

                  {/* Hints */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                    <span className="text-xs font-medium text-zinc-400">Tactical Hints</span>
                    {hintsList.map((hint, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-300 w-12 shrink-0">
                          +{hint.penaltyMins}m
                        </span>
                        <input
                          type="text"
                          value={hint.text}
                          onChange={(e) => {
                            const updated = [...hintsList];
                            updated[i] = { ...updated[i], text: e.target.value };
                            setHintsList(updated);
                          }}
                          placeholder={`Hint #${i + 1} assistance text…`}
                          className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingLevel}
                    className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white active:scale-95 text-zinc-950 font-semibold text-xs rounded-xl shadow transition-all"
                  >
                    {isSavingLevel ? 'Saving…' : 'Save Stage Configuration'}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ===================================================================
              MODE 2: CLUE POOL STUDIO (CREATE & CURATE CUSTOM CLUE BANK)
              =================================================================== */}
          {studioMode === 'pool' && (
            <div className="flex flex-col gap-4">
              {/* Clue Pool Controls Header */}
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <div>
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span>🎪</span>
                      <span>Clue Pool Bank ({poolClues.length})</span>
                    </span>
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      Reusable clues library for SDMCET hunts.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleImportFromActiveGame}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded-xl border border-zinc-700 transition-all"
                      title="Save active hunt stages into the pool"
                    >
                      📥 Import Active
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreatePoolClue}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-zinc-950 text-xs font-mono font-bold rounded-xl transition-all shadow"
                    >
                      + Create Clue
                    </button>
                  </div>
                </div>

                {/* Search & Deploy Action Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <input
                    type="text"
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    placeholder="Search clue pool…"
                    className="w-full sm:flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-400"
                  />

                  {selectedPoolIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeploySelectedPool}
                      disabled={isDeploying}
                      className="w-full sm:w-auto px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 font-mono font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>🚀</span>
                      <span>
                        {isDeploying ? 'Deploying…' : `Deploy Selected (${selectedPoolIds.length}) →`}
                      </span>
                    </button>
                  )}
                </div>

                {/* Pool Clues List */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 mt-1">
                  {filteredPoolClues.length === 0 ? (
                    <div className="py-8 text-center text-xs font-mono text-zinc-500 bg-zinc-950/60 rounded-xl border border-zinc-800 p-4">
                      {poolClues.length === 0 ? (
                        <div className="flex flex-col items-center gap-2">
                          <p>Your Clue Pool is empty.</p>
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={handleOpenCreatePoolClue}
                              className="px-3 py-1 rounded-lg bg-amber-400 text-zinc-950 font-bold text-xs"
                            >
                              + Create Clue
                            </button>
                            {levels.length > 0 && (
                              <button
                                onClick={handleImportFromActiveGame}
                                className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs"
                              >
                                Import from Active Game
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        'No clues match your search.'
                      )}
                    </div>
                  ) : (
                    filteredPoolClues.map((clue) => {
                      const isSelected = selectedPoolIds.includes(clue.id);
                      const isEditing = editingPoolClue?.id === clue.id;

                      return (
                        <div
                          key={clue.id}
                          className={`p-3 rounded-xl border transition-all text-xs flex flex-col gap-2 ${
                            isEditing
                              ? 'bg-zinc-800/90 border-emerald-400/60 shadow-md'
                              : isSelected
                              ? 'bg-zinc-950/90 border-amber-400/50'
                              : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer flex-1 truncate">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePoolSelection(clue.id)}
                                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-amber-400 accent-amber-400 cursor-pointer"
                              />
                              <span className="font-bold text-white truncate">{clue.title}</span>
                              {clue.isFinal && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono font-bold shrink-0">
                                  FINALE 🏁
                                </span>
                              )}
                            </label>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingPoolClue(clue)}
                                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 rounded text-[10px] font-mono transition-all"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePoolClue(clue.id)}
                                className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all"
                                title="Remove Clue"
                              >
                                🗑
                              </button>
                            </div>
                          </div>

                          {clue.clueText && (
                            <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 pl-6">
                              {clue.clueText}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pl-6 text-[10px] font-mono">
                            {clue.locationHint && <span className="text-zinc-500">📍 {clue.locationHint}</span>}
                            {clue.answer && (
                              <span className="bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-cyan-300 font-bold">
                                KEY: {clue.answer.toUpperCase()}
                              </span>
                            )}
                            <span className="text-zinc-500">🎯 {clue.triggerRadiusMeters ?? 25}m</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Pool Clue Editor / Creator Form */}
              {editingPoolClue && (
                <div className="bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-3.5 shadow-2xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>✏️</span>
                      <span>Configure Pool Clue</span>
                    </span>
                    <button
                      onClick={() => setEditingPoolClue(null)}
                      className="text-xs text-zinc-400 hover:text-white font-mono"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Clue / Landmark Title
                      </label>
                      <input
                        type="text"
                        value={editingPoolClue.title}
                        onChange={(e) => setEditingPoolClue({ ...editingPoolClue, title: e.target.value })}
                        placeholder="e.g. Central Library Foundation Plaque"
                        required
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Sector / Where to Go
                      </label>
                      <input
                        type="text"
                        value={editingPoolClue.locationHint}
                        onChange={(e) => setEditingPoolClue({ ...editingPoolClue, locationHint: e.target.value })}
                        placeholder="e.g. Main library courtyard steps"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                        Decrypted Riddle / Directive
                      </label>
                      <textarea
                        value={editingPoolClue.clueText}
                        onChange={(e) => setEditingPoolClue({ ...editingPoolClue, clueText: e.target.value })}
                        rows={2}
                        placeholder="The clue riddle decrypted upon arriving in range…"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Geofence & Map Target */}
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Unlock Proximity:</span>
                        <span className="text-amber-300 font-bold">{editingPoolClue.triggerRadiusMeters ?? 25}m</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="60"
                        step="5"
                        value={editingPoolClue.triggerRadiusMeters ?? 25}
                        onChange={(e) =>
                          setEditingPoolClue({ ...editingPoolClue, triggerRadiusMeters: Number(e.target.value) })
                        }
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-zinc-500">
                        Coordinates: {editingPoolClue.targetLat ? Number(editingPoolClue.targetLat).toFixed(5) : '—'}, {editingPoolClue.targetLng ? Number(editingPoolClue.targetLng).toFixed(5) : '—'} (click map to adjust)
                      </span>
                    </div>

                    {/* Secret Answer / Completion */}
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="poolIsFinal"
                          checked={Boolean(editingPoolClue.isFinal)}
                          onChange={(e) => setEditingPoolClue({ ...editingPoolClue, isFinal: e.target.checked })}
                          className="rounded bg-zinc-900 border-zinc-700 text-purple-400"
                        />
                        <label htmlFor="poolIsFinal" className="text-xs text-zinc-200 font-medium">
                          🏁 Mark as Grand Finale Clue
                        </label>
                      </div>

                      {!editingPoolClue.isFinal && (
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                            Secret Passcode / Answer
                          </label>
                          <input
                            type="text"
                            value={editingPoolClue.answer}
                            onChange={(e) => setEditingPoolClue({ ...editingPoolClue, answer: e.target.value })}
                            placeholder="e.g. quantum"
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-cyan-300 uppercase focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      )}
                    </div>

                    {/* Hints */}
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                      <span className="text-xs font-medium text-zinc-400">Tactical Hints</span>
                      {editingPoolClue.hints.map((hint, hIdx) => (
                        <div key={hIdx} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-amber-300 w-12 shrink-0">
                            +{hint.penaltyMins}m
                          </span>
                          <input
                            type="text"
                            value={hint.text}
                            onChange={(e) => {
                              const updated = [...editingPoolClue.hints];
                              updated[hIdx] = { ...updated[hIdx], text: e.target.value };
                              setEditingPoolClue({ ...editingPoolClue, hints: updated });
                            }}
                            placeholder={`Hint #${hIdx + 1} assistance text…`}
                            className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setEditingPoolClue(null)}
                        className="px-3.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-mono text-zinc-300 hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePoolClue(editingPoolClue)}
                        className="px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold font-mono shadow"
                      >
                        Save to Pool ✓
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================================
              MODE 3: HAZARD & BOUNDARY ZONES
              =================================================================== */}
          {studioMode === 'zones' && (
            <div className="flex flex-col gap-4">
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Create Geofence Zone
                  </span>
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setZoneKind('restricted')}
                      className={`px-2 py-0.5 rounded ${zoneKind === 'restricted' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-zinc-400'}`}
                    >
                      Hazard
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoneKind('permitted')}
                      className={`px-2 py-0.5 rounded ${zoneKind === 'permitted' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-400'}`}
                    >
                      Playing Area
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZoneDrawType('quick_radius')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-mono border transition-all ${
                      zoneDrawType === 'quick_radius'
                        ? 'bg-zinc-800 text-white border-zinc-600 font-bold'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    Radius Circle
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneDrawType('custom_polygon')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-mono border transition-all ${
                      zoneDrawType === 'custom_polygon'
                        ? 'bg-zinc-800 text-white border-zinc-600 font-bold'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    Polygon Points
                  </button>
                </div>

                {zoneDrawType === 'quick_radius' ? (
                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2">
                    <span className="text-[11px] font-mono text-zinc-400">
                      {zoneCenter
                        ? `✓ Center: ${zoneCenter[0].toFixed(5)}, ${zoneCenter[1].toFixed(5)}`
                        : 'Click map to place zone center'}
                    </span>
                    {zoneCenter && (
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span className="text-zinc-400">Radius:</span>
                          <span className="text-white font-bold">{zoneRadiusMeters}m</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="150"
                          step="5"
                          value={zoneRadiusMeters}
                          onChange={(e) => setZoneRadiusMeters(Number(e.target.value))}
                          className="w-full accent-cyan-400"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Points: {zonePolygonPoints.length}</span>
                      {zonePolygonPoints.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setZonePolygonPoints([])}
                          className="text-rose-400 hover:underline text-[10px]"
                        >
                          Clear Points
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      Click sequentially around the boundary on the satellite map.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Zone Description
                  </label>
                  <input
                    type="text"
                    value={zoneLabel}
                    onChange={(e) => setZoneLabel(e.target.value)}
                    placeholder={zoneKind === 'restricted' ? 'e.g. Substation & Yard' : 'e.g. SDMCET Main Campus'}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>

                {zoneKind === 'restricted' && (
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Time Penalty (Minutes)
                    </label>
                    <input
                      type="number"
                      value={zonePenaltyMins}
                      onChange={(e) => setZonePenaltyMins(Number(e.target.value))}
                      min="1"
                      max="60"
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white font-mono"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveZone}
                  disabled={isSavingZone}
                  className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white active:scale-95 text-zinc-950 font-semibold text-xs rounded-xl shadow transition-all"
                >
                  {isSavingZone ? 'Saving Zone…' : 'Save Zone Boundary'}
                </button>
              </div>

              {/* Existing Zones List */}
              <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider pb-2 border-b border-zinc-800">
                  Configured Zones ({zones.length})
                </span>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {zones.length === 0 ? (
                    <div className="py-6 text-center text-xs font-mono text-zinc-500">
                      No zones marked yet.
                    </div>
                  ) : (
                    zones.map((zone) => (
                      <div
                        key={zone.id}
                        className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                zone.kind === 'restricted' ? 'bg-rose-500' : 'bg-emerald-400'
                              }`}
                            />
                            <span className="font-bold text-white">{zone.label}</span>
                          </div>
                          {zone.kind === 'restricted' && (
                            <span className="text-[10px] text-rose-400 block mt-0.5">
                              Penalty: +{zone.penaltyMins} mins
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteZone(zone.id)}
                          className="text-zinc-500 hover:text-rose-400 text-xs px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmLevel && (
        <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <h3 className="font-bold text-white text-sm">Delete Stage #{deleteConfirmLevel.orderIndex}?</h3>
            <p className="text-xs text-zinc-400">
              Permanently remove "{deleteConfirmLevel.title}" from this event?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmLevel(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteLevel(deleteConfirmLevel)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Delete Stage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
