import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup, useMapEvents } from 'react-leaflet';
import { MapResizer } from '../../components/MapResizer';
import { SDMCET_CENTER, SDMCET_MAX_BOUNDS, SDMCET_CAMPUS_POLYGON, SATELLITE_SOURCES } from '../../lib/mapConfig';
import { SDMCET_DEFAULT_POOL, PoolClue } from '../../lib/cluePoolDefaults';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom icons
const targetPinIcon = L.divIcon({
  className: 'custom-admin-target-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-8 h-8 rounded-full bg-amber-400/30 animate-ping"></div>
    <div class="w-6 h-6 rounded-full bg-amber-400 border-2 border-zinc-950 shadow-2xl flex items-center justify-center text-xs text-zinc-950 font-black font-mono">📍</div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const activeEditingPinIcon = L.divIcon({
  className: 'custom-admin-editing-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-10 h-10 rounded-full bg-emerald-400/40 animate-ping"></div>
    <div class="w-7 h-7 rounded-full bg-emerald-400 border-2 border-zinc-950 shadow-2xl flex items-center justify-center text-xs text-zinc-950 font-black font-mono">🎯</div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const poolPinIcon = L.divIcon({
  className: 'custom-admin-pool-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="w-6 h-6 rounded-full bg-zinc-700 border-2 border-zinc-950 shadow-md flex items-center justify-center text-[10px] text-zinc-300 font-mono">🎪</div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const poolSelectedPinIcon = L.divIcon({
  className: 'custom-admin-pool-selected-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-7 h-7 rounded-full bg-cyan-400/40 animate-ping"></div>
    <div class="w-6 h-6 rounded-full bg-cyan-400 border-2 border-zinc-950 shadow-2xl flex items-center justify-center text-[10px] text-zinc-950 font-black font-mono">★</div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

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
  studioMode: 'level' | 'pool' | 'restricted' | 'playing_area';
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
  { name: 'Amphitheatre', lat: 15.4272, lng: 75.0146 },
  { name: 'Science Block', lat: 15.4289, lng: 75.0142 },
  { name: 'Civil / Workshop', lat: 15.4268, lng: 75.0158 },
];

export default function AdminLevels() {
  const [game, setGame] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);

  // Studio Mode: 'level' (objectives) | 'pool' (clue library) | 'restricted' (hazard zones) | 'playing_area' (boundary)
  const [studioMode, setStudioMode] = useState<'level' | 'pool' | 'restricted' | 'playing_area'>('level');

  // Clue Pool State
  const [poolClues, setPoolClues] = useState<PoolClue[]>(() => {
    try {
      const saved = localStorage.getItem('ch-clue-pool');
      if (saved) return JSON.parse(saved);
    } catch {}
    return SDMCET_DEFAULT_POOL;
  });

  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ch-clue-pool-selected');
      if (saved) return JSON.parse(saved);
    } catch {}
    return SDMCET_DEFAULT_POOL.map((c) => c.id);
  });

  const [editingPoolClue, setEditingPoolClue] = useState<PoolClue | null>(null);
  const [poolSearchQuery, setPoolSearchQuery] = useState<string>('');
  const [isDeployingPool, setIsDeployingPool] = useState<boolean>(false);

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

    // Populate hints
    const existingHints = (lvl.hints ?? []).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
    const populated = [
      { text: existingHints[0]?.text ?? '', penaltyMins: existingHints[0]?.penaltyMins ?? 2 },
      { text: existingHints[1]?.text ?? '', penaltyMins: existingHints[1]?.penaltyMins ?? 4 },
      { text: existingHints[2]?.text ?? '', penaltyMins: existingHints[2]?.penaltyMins ?? 6 },
    ];
    setHintsList(populated);
    setSocialLinksList(lvl.socialLinks ? lvl.socialLinks.map((s: any) => ({ platform: s.platform || 'Social Intel', url: s.url })) : []);
  }

  async function handleGenerate26Pack() {
    if (!game) return;
    if (
      !confirm(
        'Generate the complete 25 Intermediate Landmarks + 1 Grand Finale Clue pack across SDMCET campus?\nThis will configure all 26 distinct stations for zero-overlap 25-team play.',
      )
    )
      return;
    try {
      await api.generate26Pack(game.id);
      await reload();
      alert('✓ 26 Campus Clues (25 Intermediate + 1 Grand Finale) successfully generated!');
    } catch (err: any) {
      alert(err.message ?? 'Failed to generate 26-clue pack');
    }
  }

  function handleCreateNewLevel() {
    const nextOrder = levels.length + 1;
    const newLvl = {
      title: `Objective ${nextOrder}`,
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

  // Clue Pool Persistence Helper
  function updatePoolClues(updated: PoolClue[], updatedSelected?: string[]) {
    setPoolClues(updated);
    try {
      localStorage.setItem('ch-clue-pool', JSON.stringify(updated));
      if (updatedSelected !== undefined) {
        setSelectedPoolIds(updatedSelected);
        localStorage.setItem('ch-clue-pool-selected', JSON.stringify(updatedSelected));
      }
    } catch (e) {
      console.error('Failed to save clue pool to localStorage', e);
    }
  }

  // Toggle single clue selection in pool
  function togglePoolSelection(id: string) {
    const next = selectedPoolIds.includes(id)
      ? selectedPoolIds.filter((item) => item !== id)
      : [...selectedPoolIds, id];
    setSelectedPoolIds(next);
    try {
      localStorage.setItem('ch-clue-pool-selected', JSON.stringify(next));
    } catch {}
  }

  // Select all or clear selection
  function handleSelectAllPool(select: boolean) {
    const next = select ? poolClues.map((c) => c.id) : [];
    setSelectedPoolIds(next);
    try {
      localStorage.setItem('ch-clue-pool-selected', JSON.stringify(next));
    } catch {}
  }

  // Reset pool to 26 campus presets
  function handleResetPoolToDefaults() {
    if (confirm('Reset Clue Pool to the default 26 SDMCET Campus Landmarks library? Any custom modifications will be replaced.')) {
      updatePoolClues(SDMCET_DEFAULT_POOL, SDMCET_DEFAULT_POOL.map((c) => c.id));
      alert('✓ Clue Pool successfully reset to 26 SDMCET Campus Landmarks!');
    }
  }

  // Start adding a new custom clue to the pool
  function handleOpenAddPoolClue() {
    const newId = `pool-custom-${Date.now()}`;
    setEditingPoolClue({
      id: newId,
      title: `Custom Landmark ${poolClues.length + 1}`,
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

  // Save the pool clue being edited
  function handleSavePoolClue(clue: PoolClue) {
    const existingIdx = poolClues.findIndex((c) => c.id === clue.id);
    let nextPool: PoolClue[];
    let nextSelected = [...selectedPoolIds];

    if (existingIdx >= 0) {
      nextPool = [...poolClues];
      nextPool[existingIdx] = clue;
    } else {
      nextPool = [...poolClues, clue];
      if (!nextSelected.includes(clue.id)) {
        nextSelected.push(clue.id);
      }
    }

    updatePoolClues(nextPool, nextSelected);
    setEditingPoolClue(null);
  }

  // Delete clue from pool
  function handleDeletePoolClue(id: string) {
    if (!confirm('Remove this clue from your pool library?')) return;
    const nextPool = poolClues.filter((c) => c.id !== id);
    const nextSelected = selectedPoolIds.filter((item) => item !== id);
    updatePoolClues(nextPool, nextSelected);
    if (editingPoolClue?.id === id) {
      setEditingPoolClue(null);
    }
  }

  // 1-Click Deploy Selected Pool Clues into Active Game
  async function handleDeploySelectedPool() {
    if (!game) return;
    const selected = poolClues.filter((c) => selectedPoolIds.includes(c.id));
    if (selected.length === 0) {
      alert('Please select at least 1 clue from the pool to deploy.');
      return;
    }

    const ok = confirm(
      `Deploy ${selected.length} selected clues from the pool to the active game?\n\nThis will configure ${selected.length} stages for current gameplay and automatically set up team paths.`
    );
    if (!ok) return;

    setIsDeployingPool(true);
    try {
      const res = await api.deployPool(game.id, selected);
      await reload();
      setStudioMode('level');
      alert(`✓ Successfully deployed ${res.count || selected.length} clues to the active game!`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to deploy pool clues');
    } finally {
      setIsDeployingPool(false);
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
      alert(`✓ Objective #${lvl.orderIndex} deleted.`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete objective');
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
      alert(err.message ?? 'Failed to reorder objective');
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
      // Close ring
      coordinates.push(coordinates[0]);
    }

    setIsSavingZone(true);
    try {
      const geoJson = JSON.stringify({
        type: 'Polygon',
        coordinates: [coordinates],
      });

      await api.createZone(game.id, {
        kind: studioMode === 'restricted' ? 'restricted' : 'permitted',
        label: zoneLabel.trim(),
        geoJson,
        penaltyMins: studioMode === 'restricted' ? Number(zonePenaltyMins) : 0,
        active: true,
      });

      // Reset zone drawing inputs
      setZoneLabel('');
      setZoneCenter(null);
      setZonePolygonPoints([]);
      await reload();
      alert(`✓ ${studioMode === 'restricted' ? 'Restricted Hazard Zone' : 'Playing Area Zone'} saved successfully.`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to save zone');
    } finally {
      setIsSavingZone(false);
    }
  }

  // Delete Zone
  async function handleDeleteZone(zoneId: number) {
    if (!confirm('Permanently delete this zone from the game?')) return;
    try {
      await api.deleteZone(zoneId);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete zone');
    }
  }

  // Toggle Zone Active
  async function handleToggleZone(zoneId: number) {
    try {
      await api.toggleZone(zoneId);
      await reload();
    } catch (err: any) {
      alert(err.message ?? 'Failed to toggle zone');
    }
  }

  // Preview Polygon for Zone in creation
  const liveZonePreviewPolygon = useMemo(() => {
    if (zoneDrawType === 'quick_radius') {
      if (!zoneCenter) return null;
      const coords = circleToPolygonCoordinates(zoneCenter[0], zoneCenter[1], zoneRadiusMeters);
      return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    } else {
      if (zonePolygonPoints.length < 2) return null;
      return zonePolygonPoints;
    }
  }, [zoneDrawType, zoneCenter, zoneRadiusMeters, zonePolygonPoints]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* =========================================================================
          TOP COMMAND HEADER & MODE SELECTOR
          ========================================================================= */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>Map, Objectives & Geofencing Studio</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Place clues visually on satellite imagery, configure passcodes & hints, or mark restricted/playing zones.
          </p>
        </div>

        {/* Primary Studio Mode Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 shadow-inner">
          <button
            onClick={() => setStudioMode('level')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'level'
                ? 'bg-zinc-800 text-white shadow-md border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎯</span>
            <span>Objectives ({levels.length})</span>
          </button>

          <button
            onClick={() => setStudioMode('pool')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'pool'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-md'
                : 'text-zinc-400 hover:text-amber-400'
            }`}
          >
            <span>🎪</span>
            <span>Clue Pool Studio ({poolClues.length})</span>
          </button>

          <button
            onClick={() => setStudioMode('restricted')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'restricted'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-md'
                : 'text-zinc-400 hover:text-rose-400'
            }`}
          >
            <span>🚫</span>
            <span>Restricted Areas ({zones.filter((z) => z.kind === 'restricted').length})</span>
          </button>

          <button
            onClick={() => setStudioMode('playing_area')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              studioMode === 'playing_area'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-md'
                : 'text-zinc-400 hover:text-emerald-400'
            }`}
          >
            <span>🟢</span>
            <span>Playing Area ({zones.filter((z) => z.kind === 'permitted').length})</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN STUDIO GRID: SATELLITE MAP (LEFT) + CONFIGURATION DESK (RIGHT)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ==========================================
            LEFT: INTERACTIVE SATELLITE MAP (7 COLS)
            ========================================== */}
        <div className="lg:col-span-7 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
          {/* Map Top Bar: Action Guidance & Satellite Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                {studioMode === 'level'
                  ? editForm
                    ? `📍 Click Map to Place: ${editForm.title}`
                    : 'Select or Create an Objective'
                  : studioMode === 'pool'
                  ? editingPoolClue
                    ? `🎪 Click Map to Position: ${editingPoolClue.title}`
                    : '🎪 Clue Pool Studio: Inspect landmarks or check to select'
                  : studioMode === 'restricted'
                  ? '🚫 Click Map to Draw Restricted Danger Zone'
                  : '🟢 Click Map to Draw Playing Boundary'}
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

          {/* Quick Landmark Presets for 1-Click Placement in Level Mode */}
          {studioMode === 'level' && editForm && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950/70 border border-zinc-800/80 rounded-xl">
              <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase mr-1">
                CAMPUS PRESETS:
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

          {/* The Interactive Map Viewport */}
          <div className="h-[540px] w-full rounded-xl overflow-hidden border border-zinc-800 relative cursor-crosshair shadow-inner">
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

              {/* SDMCET Campus Boundary Polygon */}
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

              {/* Pool Clues Markers (when in Pool Studio Mode) */}
              {studioMode === 'pool' &&
                poolClues.map((clue, idx) => {
                  if (clue.targetLat == null || clue.targetLng == null) return null;
                  const isSelected = selectedPoolIds.includes(clue.id);
                  const isEditing = editingPoolClue?.id === clue.id;

                  return (
                    <div key={clue.id}>
                      <Circle
                        center={[clue.targetLat, clue.targetLng]}
                        radius={clue.triggerRadiusMeters ?? 25}
                        pathOptions={{
                          color: isEditing ? '#10b981' : isSelected ? '#38bdf8' : '#71717a',
                          fillColor: isEditing ? '#10b981' : isSelected ? '#38bdf8' : '#71717a',
                          fillOpacity: isEditing ? 0.35 : isSelected ? 0.2 : 0.05,
                          weight: isEditing ? 2.5 : isSelected ? 2 : 1,
                        }}
                      />
                      <Marker
                        position={[clue.targetLat, clue.targetLng]}
                        icon={isEditing ? activeEditingPinIcon : isSelected ? poolSelectedPinIcon : poolPinIcon}
                        eventHandlers={{
                          click: () => {
                            setEditingPoolClue(clue);
                          },
                        }}
                      >
                        <Popup>
                          <div className="text-xs font-mono">
                            <p className="font-bold text-zinc-900">{clue.title}</p>
                            <p className="text-zinc-600">Pool Landmark #{idx + 1}</p>
                            <p className="text-zinc-600">{clue.locationHint}</p>
                            <p className={isSelected ? 'text-cyan-700 font-bold' : 'text-zinc-500'}>
                              {isSelected ? '✓ Selected for Live Deployment' : '○ Not selected'}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    </div>
                  );
                })}

              {/* Existing Level Targets */}
              {studioMode !== 'pool' && levels.map((lvl) => {
                if (lvl.targetLat == null || lvl.targetLng == null) return null;
                const isSelected = selectedLevelId === lvl.id && studioMode === 'level';

                return (
                  <div key={lvl.id}>
                    <Circle
                      center={[lvl.targetLat, lvl.targetLng]}
                      radius={lvl.triggerRadiusMeters ?? 25}
                      pathOptions={{
                        color: isSelected ? '#38bdf8' : '#f59e0b',
                        fillColor: isSelected ? '#38bdf8' : '#f59e0b',
                        fillOpacity: isSelected ? 0.35 : 0.15,
                        weight: isSelected ? 2.5 : 1.5,
                      }}
                    />
                    <Marker
                      position={[lvl.targetLat, lvl.targetLng]}
                      icon={isSelected ? activeEditingPinIcon : targetPinIcon}
                      eventHandlers={{
                        click: () => {
                          setStudioMode('level');
                          selectLevel(lvl);
                        },
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-mono">
                          <p className="font-bold text-zinc-900">{lvl.title}</p>
                          <p className="text-zinc-600">Stage #{lvl.orderIndex}</p>
                          <p className="text-zinc-600">Radius: {lvl.triggerRadiusMeters ?? 25}m</p>
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                );
              })}

              {/* Active Editing Level Target (Live Preview) */}
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

              {/* Existing Restricted & Permitted Zones */}
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

              {/* Live Preview of Zone Under Construction */}
              {(studioMode === 'restricted' || studioMode === 'playing_area') && liveZonePreviewPolygon && (
                <Polygon
                  positions={liveZonePreviewPolygon}
                  pathOptions={{
                    color: studioMode === 'restricted' ? '#f43f5e' : '#10b981',
                    fillColor: studioMode === 'restricted' ? '#f43f5e' : '#10b981',
                    fillOpacity: 0.35,
                    weight: 2.5,
                    dashArray: '3 3',
                  }}
                />
              )}
            </MapContainer>
          </div>

          {/* Map Legend */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-400 px-1 font-mono">
            <span>Click map to place targets or draw boundary vertices.</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Active Target
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Restricted Zone
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Playing Area
              </span>
            </div>
          </div>
        </div>

        {/* =====================================================================
            RIGHT: WORKBENCH FOR OBJECTIVES (MODE = LEVEL) OR ZONES (MODE = ZONES)
            ===================================================================== */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* ===================================================================
              MODE 1: OBJECTIVES & CLUES STUDIO
              =================================================================== */}
          {studioMode === 'level' && (
            <>
              {/* Objectives Sequence Carousel / List */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Hunt Stages Sequence
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleGenerate26Pack}
                      className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold rounded-xl transition-all shadow-md flex items-center gap-1"
                      title="Populate complete 25 Intermediate Clues + 1 Grand Finale pack across campus"
                    >
                      <span>⚡</span>
                      <span>26-Clue Pack</span>
                    </button>
                    <button
                      onClick={handleCreateNewLevel}
                      className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 text-xs font-mono font-black rounded-xl transition-all shadow-md flex items-center gap-1 active:scale-95"
                    >
                      <span>➕</span>
                      <span>New Objective</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {levels.map((lvl, index) => {
                    const isSelected = selectedLevelId === lvl.id;
                    return (
                      <div
                        key={lvl.id}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all text-xs ${
                          isSelected
                            ? 'bg-zinc-800 border-cyan-400/50 text-white shadow-md'
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
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                              FINALE 🏁
                            </span>
                          )}
                        </div>

                        {/* Reorder & Delete */}
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
                            title="Delete Objective"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Objective Form Editor */}
              {editForm && (
                <form
                  onSubmit={handleSaveLevel}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4 shadow-xl"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      {editForm.id ? `Editing Stage 0${editForm.orderIndex}` : 'Configure New Objective'}
                    </span>

                    {editForm.id && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmLevel(editForm)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 hover:underline"
                      >
                        <span>🗑 Delete</span>
                      </button>
                    )}
                  </div>

                  {/* Section 1: Stage Identity & Location */}
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                        1. OBJECTIVE TITLE
                      </label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        required
                        placeholder="e.g. The Clocktower Shadow"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-medium"
                      />
                    </div>

                    {/* Coordinates & Proximity Slider */}
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                          2. TARGET GEOFENCE & PROXIMITY
                        </span>
                        <span className="text-xs font-mono font-bold text-white bg-zinc-800 px-2 py-0.5 rounded">
                          Radius: {editForm.triggerRadiusMeters ?? 25}m
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                          <span className="text-[9px] text-zinc-500 block">LATITUDE</span>
                          <span className="text-white font-bold">{editForm.targetLat ? Number(editForm.targetLat).toFixed(5) : '—'}</span>
                        </div>
                        <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                          <span className="text-[9px] text-zinc-500 block">LONGITUDE</span>
                          <span className="text-white font-bold">{editForm.targetLng ? Number(editForm.targetLng).toFixed(5) : '—'}</span>
                        </div>
                      </div>

                      <div>
                        <input
                          type="range"
                          min="15"
                          max="60"
                          step="5"
                          value={editForm.triggerRadiusMeters ?? 25}
                          onChange={(e) => setEditForm({ ...editForm, triggerRadiusMeters: Number(e.target.value) })}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                        <span className="text-[9px] font-mono text-zinc-500 block text-right mt-0.5">
                          Click satellite map to adjust pin position
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Clue & Campus Guidance */}
                  <div className="flex flex-col gap-2.5">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                        3. CAMPUS SECTOR GUIDANCE (WHERE TO GO)
                      </label>
                      <input
                        type="text"
                        value={editForm.locationHint}
                        onChange={(e) => setEditForm({ ...editForm, locationHint: e.target.value })}
                        placeholder="e.g. Search near the North Entrance of Main Library"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                        4. DECRYPTED CLUE TEXT (REVEALED IN PROXIMITY)
                      </label>
                      <textarea
                        value={editForm.clueText}
                        onChange={(e) => setEditForm({ ...editForm, clueText: e.target.value })}
                        required
                        rows={2}
                        placeholder="Enter the riddle, cipher, or operative instructions participants decrypt upon arrival…"
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Section 3: Verification Passcode OR Grand Finale */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                      5. VICTORY & ADVANCEMENT CONDITION
                    </span>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isFinal"
                        checked={Boolean(editForm.isFinal)}
                        onChange={(e) => setEditForm({ ...editForm, isFinal: e.target.checked })}
                        className="rounded bg-zinc-900 border-zinc-700 text-emerald-400"
                      />
                      <label htmlFor="isFinal" className="text-xs text-zinc-200 font-mono font-bold">
                        🏁 Mark as Grand Finale Objective
                      </label>
                    </div>

                    {editForm.isFinal ? (
                      <p className="text-[11px] text-emerald-400/90 font-mono leading-relaxed bg-emerald-950/30 p-2 rounded-lg border border-emerald-500/20">
                        Participants must snap live camera photo proof with the target operative at Amphitheatre and sprint to the finish line. Coordinators review and verify photo in Command Desk.
                      </p>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                          SECRET PASSCODE / ANSWER
                        </label>
                        <input
                          type="text"
                          value={editForm.answer}
                          onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                          placeholder="e.g. anonymous"
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400 uppercase"
                        />
                      </div>
                    )}
                  </div>

                  {/* Section 4: Tactical Assistance Hints (1, 2, 3) */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                      6. TACTICAL HINTS & TIME PENALTIES
                    </span>

                    <div className="flex flex-col gap-2">
                      {hintsList.map((hint, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-amber-300 w-14 shrink-0">
                            #{i + 1} (+{hint.penaltyMins}m):
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
                            className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 5: External Clue Signals & Social Intel (Inline QR Code Generator) */}
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold flex items-center gap-1">
                        <span>🌐</span>
                        <span>7. EXTERNAL CLUE INTEL & SOCIAL MEDIA LINKS</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSocialLinksList([...socialLinksList, { platform: 'Instagram Dossier', url: '' }])}
                        className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/50 border border-cyan-500/30 px-2 py-0.5 rounded-lg transition-all"
                      >
                        ➕ Add Link
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Add social media links (Instagram, YouTube, Drive). Inline scannable QR codes are automatically generated for teammates to scan on secondary phones!
                    </p>
                    {socialLinksList.length === 0 ? (
                      <span className="text-[10px] font-mono text-zinc-500 italic">No external social links attached to this stage.</span>
                    ) : (
                      socialLinksList.map((sl, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={sl.platform}
                            onChange={(e) => {
                              const updated = [...socialLinksList];
                              updated[sIdx].platform = e.target.value;
                              setSocialLinksList(updated);
                            }}
                            placeholder="Platform (e.g. Instagram)"
                            className="w-1/3 px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                          />
                          <input
                            type="url"
                            value={sl.url}
                            onChange={(e) => {
                              const updated = [...socialLinksList];
                              updated[sIdx].url = e.target.value;
                              setSocialLinksList(updated);
                            }}
                            placeholder="https://..."
                            className="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => setSocialLinksList(socialLinksList.filter((_, i) => i !== sIdx))}
                            className="text-zinc-500 hover:text-rose-400 text-xs px-1.5 py-1"
                            title="Remove link"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Save Button */}
                  <button
                    type="submit"
                    disabled={isSavingLevel}
                    className="w-full py-3 px-4 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-xl transition-all"
                  >
                    {isSavingLevel ? 'TRANSMITTING CHANGES…' : 'SAVE OBJECTIVE CONFIGURATION →'}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ===================================================================
              MODE 4: CLUE POOL STUDIO (MASTER CLUE REPOSITORY)
              =================================================================== */}
          {studioMode === 'pool' && (
            <div className="flex flex-col gap-4">
              {/* Pool Header & Stats Banner */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎪</span>
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      Clue Pool Library
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleResetPoolToDefaults}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded-xl transition-all flex items-center gap-1 border border-zinc-700"
                      title="Reset pool to 26 SDMCET campus landmarks"
                    >
                      <span>↺</span>
                      <span>Reset 26 Pack</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenAddPoolClue}
                      className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-zinc-950 text-xs font-mono font-black rounded-xl transition-all shadow-md flex items-center gap-1 active:scale-95"
                    >
                      <span>➕</span>
                      <span>Add Pool Clue</span>
                    </button>
                  </div>
                </div>

                {/* 1-Click Live Deployment Card */}
                <div className="bg-gradient-to-r from-amber-500/15 via-cyan-500/10 to-emerald-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col gap-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-xs font-mono font-black text-amber-300 uppercase tracking-wider">
                        Deploy Clues to Live Game
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-white bg-zinc-950/80 border border-zinc-800 px-2.5 py-0.5 rounded-full">
                      {selectedPoolIds.length} of {poolClues.length} Selected
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-300 leading-relaxed">
                    Select a subset of landmarks from your clue bank below. When ready, 1-click deploy instantly configures the hunt stages for live gameplay!
                  </p>
                  <button
                    type="button"
                    onClick={handleDeploySelectedPool}
                    disabled={isDeployingPool || selectedPoolIds.length === 0}
                    className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>🚀</span>
                    <span>
                      {isDeployingPool
                        ? 'DEPLOYING SELECTED CLUES…'
                        : `DEPLOY ${selectedPoolIds.length} SELECTED CLUES TO GAME →`}
                    </span>
                  </button>
                </div>

                {/* Search & Bulk Select Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                  <input
                    type="text"
                    value={poolSearchQuery}
                    onChange={(e) => setPoolSearchQuery(e.target.value)}
                    placeholder="Search pool landmarks, answers, or riddles…"
                    className="w-full sm:flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-400"
                  />
                  <div className="flex items-center gap-1.5 self-end shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectAllPool(true)}
                      className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 rounded-lg transition-all"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAllPool(false)}
                      className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 rounded-lg transition-all"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Pool Clues Scrollable Roster */}
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 mt-1">
                  {poolClues
                    .filter((c) => {
                      if (!poolSearchQuery.trim()) return true;
                      const q = poolSearchQuery.toLowerCase();
                      return (
                        c.title.toLowerCase().includes(q) ||
                        c.locationHint.toLowerCase().includes(q) ||
                        c.clueText.toLowerCase().includes(q) ||
                        c.answer.toLowerCase().includes(q)
                      );
                    })
                    .map((clue, idx) => {
                      const isSelected = selectedPoolIds.includes(clue.id);
                      return (
                        <div
                          key={clue.id}
                          className={`p-3 rounded-xl border transition-all text-xs flex flex-col gap-2 ${
                            isSelected
                              ? 'bg-zinc-950/90 border-amber-400/50 shadow-md'
                              : 'bg-zinc-950/40 border-zinc-800/70 text-zinc-400 opacity-80'
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
                              <span className="font-mono text-[10px] text-zinc-500 font-bold">
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-white truncate">{clue.title}</span>
                              {clue.isFinal && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono font-bold shrink-0">
                                  FINALE 🏁
                                </span>
                              )}
                            </label>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingPoolClue(clue)}
                                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 rounded text-[10px] font-mono transition-all"
                              >
                                ✏️ Edit
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

                          <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 pl-6">
                            {clue.clueText || 'No clue description set.'}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 pl-6 text-[10px] font-mono">
                            <span className="text-zinc-500">📍 {clue.locationHint || 'Campus'}</span>
                            {clue.answer && (
                              <span className="bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-cyan-300">
                                KEY: {clue.answer.toUpperCase()}
                              </span>
                            )}
                            <span className="text-zinc-500">
                              🎯 {clue.triggerRadiusMeters ?? 25}m
                            </span>
                            {clue.hints && clue.hints.filter((h) => h.text.trim()).length > 0 && (
                              <span className="text-amber-400/90">
                                💡 {clue.hints.filter((h) => h.text.trim()).length} hint(s)
                              </span>
                            )}
                            {clue.socialLinks && clue.socialLinks.length > 0 && (
                              <span className="text-cyan-400">
                                🌐 {clue.socialLinks.length} social link(s) (QR)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              MODE 2 & 3: RESTRICTED AREAS & PLAYING AREA STUDIO
              =================================================================== */}
          {(studioMode === 'restricted' || studioMode === 'playing_area') && (
            <div className="flex flex-col gap-4">
              {/* Zone Creator Card */}
              <div
                className={`bg-zinc-900/80 border rounded-2xl p-4 flex flex-col gap-3.5 shadow-xl ${
                  studioMode === 'restricted' ? 'border-rose-500/30' : 'border-emerald-500/30'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>{studioMode === 'restricted' ? '🚫' : '🟢'}</span>
                    <span>
                      {studioMode === 'restricted' ? 'Mark Restricted Danger Zone' : 'Mark Playing Area Boundary'}
                    </span>
                  </span>

                  <span
                    className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                      studioMode === 'restricted'
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {studioMode === 'restricted' ? 'HAZARD PENALTY' : 'PERMITTED'}
                  </span>
                </div>

                {/* Drawing Mode Selector */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZoneDrawType('quick_radius')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                      zoneDrawType === 'quick_radius'
                        ? 'bg-zinc-800 text-white border-zinc-600'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    ⚡ Quick Center & Radius
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoneDrawType('custom_polygon')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                      zoneDrawType === 'custom_polygon'
                        ? 'bg-zinc-800 text-white border-zinc-600'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    📐 Custom Polygon Points
                  </button>
                </div>

                {/* Drawing Instructions & Feedback */}
                {zoneDrawType === 'quick_radius' ? (
                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2">
                    <span className="text-[10px] font-mono text-zinc-400">
                      {zoneCenter
                        ? `✓ Center Placed: ${zoneCenter[0].toFixed(5)}°N, ${zoneCenter[1].toFixed(5)}°E`
                        : '👉 Click anywhere on the satellite map to place the zone center'}
                    </span>

                    {zoneCenter && (
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                          <span className="text-zinc-400">Zone Radius:</span>
                          <span className="text-white font-bold">{zoneRadiusMeters} meters</span>
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
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-zinc-400">
                        Polygon Corners: {zonePolygonPoints.length} points clicked
                      </span>
                      {zonePolygonPoints.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setZonePolygonPoints([])}
                          className="text-[10px] font-mono text-rose-400 hover:underline"
                        >
                          Clear Points
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      Click sequentially around the perimeter on the satellite map to draw the boundary.
                    </p>
                  </div>
                )}

                {/* Zone Label Input */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                    ZONE LABEL / DESCRIPTION
                  </label>
                  <input
                    type="text"
                    value={zoneLabel}
                    onChange={(e) => setZoneLabel(e.target.value)}
                    placeholder={
                      studioMode === 'restricted'
                        ? 'e.g. Electrical Substation & Yard'
                        : 'e.g. SDMCET Main Playing Field'
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-medium"
                  />
                </div>

                {/* Restricted Penalty Minutes */}
                {studioMode === 'restricted' && (
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                      TIME PENALTY ON TRESPASS (MINUTES)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={zonePenaltyMins}
                      onChange={(e) => setZonePenaltyMins(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-rose-400"
                    />
                  </div>
                )}

                {/* Save Zone Button */}
                <button
                  type="button"
                  onClick={handleSaveZone}
                  disabled={isSavingZone || (!zoneCenter && zonePolygonPoints.length < 3)}
                  className={`w-full py-3 px-4 rounded-xl font-mono font-black text-xs uppercase tracking-wider shadow-xl transition-all ${
                    studioMode === 'restricted'
                      ? 'bg-rose-500 hover:bg-rose-400 text-white'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isSavingZone ? 'SAVING ZONE…' : 'SAVE ZONE TO GAME MAP →'}
                </button>
              </div>

              {/* Active Zones Roster */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider pb-2 border-b border-zinc-800">
                  Configured Campus Zones ({zones.length})
                </span>

                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                  {zones.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-mono text-center py-4">
                      No custom zones defined yet. Click on the map to add one.
                    </p>
                  ) : (
                    zones.map((zone) => {
                      const isRestricted = zone.kind === 'restricted';
                      return (
                        <div
                          key={zone.id}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{isRestricted ? '🚫' : '🟢'}</span>
                            <div>
                              <p className="text-white font-bold">{zone.label || 'Unnamed Zone'}</p>
                              <span
                                className={`text-[10px] ${
                                  isRestricted ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {isRestricted ? `+${zone.penaltyMins}m Penalty` : 'Playing Area'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleZone(zone.id)}
                              className={`px-2 py-1 rounded text-[10px] font-bold ${
                                zone.active
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-zinc-800 text-zinc-500'
                              }`}
                            >
                              {zone.active ? 'ACTIVE' : 'MUTED'}
                            </button>
                            <button
                              onClick={() => handleDeleteZone(zone.id)}
                              className="text-zinc-500 hover:text-rose-400 text-sm p-1"
                              title="Delete Zone"
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
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          DELETE LEVEL CONFIRMATION MODAL
          ========================================================================= */}
      {deleteConfirmLevel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <span>⚠️</span>
              <span>Delete Objective #{deleteConfirmLevel.orderIndex}?</span>
            </h3>
            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Are you sure you want to delete <strong>"{deleteConfirmLevel.title}"</strong>?
              All associated hints, checkpoint questions, and participant level logs will be safely removed.
              Remaining objectives will automatically re-index.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmLevel(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteLevel(deleteConfirmLevel)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow"
              >
                Yes, Delete Level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT / CREATE POOL CLUE MODAL
          ========================================================================= */}
      {editingPoolClue && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 my-8">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>🎪</span>
                <span>Configure Pool Landmark Clue</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingPoolClue(null)}
                className="text-zinc-400 hover:text-white font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
                  CLUE TITLE
                </label>
                <input
                  type="text"
                  value={editingPoolClue.title}
                  onChange={(e) => setEditingPoolClue({ ...editingPoolClue, title: e.target.value })}
                  placeholder="e.g. Science Block Board"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-medium focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
                  CAMPUS SECTOR GUIDANCE
                </label>
                <input
                  type="text"
                  value={editingPoolClue.locationHint}
                  onChange={(e) => setEditingPoolClue({ ...editingPoolClue, locationHint: e.target.value })}
                  placeholder="e.g. Science Block Ground Floor"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
                  CLUE RIDDLE / DIRECTIVE
                </label>
                <textarea
                  rows={2}
                  value={editingPoolClue.clueText}
                  onChange={(e) => setEditingPoolClue({ ...editingPoolClue, clueText: e.target.value })}
                  placeholder="Enter decrypted clue riddle text…"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="poolIsFinal"
                  checked={Boolean(editingPoolClue.isFinal)}
                  onChange={(e) => setEditingPoolClue({ ...editingPoolClue, isFinal: e.target.checked })}
                  className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-emerald-400"
                />
                <label htmlFor="poolIsFinal" className="text-zinc-200 font-mono font-bold">
                  🏁 Mark as Grand Finale Objective
                </label>
              </div>

              {!editingPoolClue.isFinal && (
                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">
                    SECRET PASSCODE / ANSWER
                  </label>
                  <input
                    type="text"
                    value={editingPoolClue.answer}
                    onChange={(e) => setEditingPoolClue({ ...editingPoolClue, answer: e.target.value })}
                    placeholder="e.g. quantum"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-cyan-300 focus:outline-none focus:border-amber-400 uppercase"
                  />
                </div>
              )}

              {/* Coordinates */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                    SATELLITE COORDINATES & GEOFENCE
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Radius: {editingPoolClue.triggerRadiusMeters ?? 25}m
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-zinc-300 font-mono text-[11px]">
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <span className="text-[9px] text-zinc-500 block">LATITUDE</span>
                    <span>{editingPoolClue.targetLat ? Number(editingPoolClue.targetLat).toFixed(5) : '—'}</span>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <span className="text-[9px] text-zinc-500 block">LONGITUDE</span>
                    <span>{editingPoolClue.targetLng ? Number(editingPoolClue.targetLng).toFixed(5) : '—'}</span>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-amber-400/80">
                  👉 Click anywhere on the satellite map in background to reposition coordinates.
                </span>
              </div>

              {/* Tactical Hints */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                  TACTICAL HINTS & TIME PENALTIES
                </span>
                {editingPoolClue.hints.map((hint, hIdx) => (
                  <div key={hIdx} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-amber-300 w-12 shrink-0">
                      #{hIdx + 1} (+{hint.penaltyMins}m):
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
                      className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ))}
              </div>

              {/* Social Media Links (QR code) */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                    SOCIAL MEDIA LINKS (QR CODE)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPoolClue({
                        ...editingPoolClue,
                        socialLinks: [
                          ...(editingPoolClue.socialLinks || []),
                          { platform: 'Instagram Dossier', url: '' },
                        ],
                      })
                    }
                    className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/50 border border-cyan-500/30 px-2 py-0.5 rounded-lg"
                  >
                    ➕ Add Link
                  </button>
                </div>
                {(editingPoolClue.socialLinks || []).map((sl, slIdx) => (
                  <div key={slIdx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={sl.platform}
                      onChange={(e) => {
                        const updated = [...(editingPoolClue.socialLinks || [])];
                        updated[slIdx].platform = e.target.value;
                        setEditingPoolClue({ ...editingPoolClue, socialLinks: updated });
                      }}
                      placeholder="Platform"
                      className="w-1/3 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                    />
                    <input
                      type="url"
                      value={sl.url}
                      onChange={(e) => {
                        const updated = [...(editingPoolClue.socialLinks || [])];
                        updated[slIdx].url = e.target.value;
                        setEditingPoolClue({ ...editingPoolClue, socialLinks: updated });
                      }}
                      placeholder="https://..."
                      className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (editingPoolClue.socialLinks || []).filter((_, i) => i !== slIdx);
                        setEditingPoolClue({ ...editingPoolClue, socialLinks: updated });
                      }}
                      className="text-zinc-500 hover:text-rose-400 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingPoolClue(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSavePoolClue(editingPoolClue)}
                className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-black font-mono shadow"
              >
                Save Clue to Pool ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
