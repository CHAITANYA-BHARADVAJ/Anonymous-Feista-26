import { MapContainer, TileLayer, Polygon, Circle, Marker, useMap } from 'react-leaflet';
import { useGameStore } from '../../stores/gameStore';
import { useLocation } from '../../hooks/useLocation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function LocateMe({ pos }: { pos: GeolocationCoordinates | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.latitude, pos.longitude], map.getZoom());
  }, [pos?.latitude, pos?.longitude]);
  return null;
}

export default function MapView() {
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const { pos, error } = useLocation();

  const zones = game?.zones ?? [];
  const center: [number, number] = pos ? [pos.latitude, pos.longitude] : [12.97, 77.59];

  // Parse map overlay from current level if unlocked
  let overlay: any = null;
  if (currentLevel?.level.mapOverlayGeoJson) {
    try { overlay = JSON.parse(currentLevel.level.mapOverlayGeoJson); } catch {}
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 text-sm text-gray-400">
        🗺 Campus Map
        {error && <span className="ml-2 text-red-400">— GPS unavailable</span>}
      </div>

      <div className="flex-1 relative">
        <MapContainer center={center} zoom={17} className="h-full w-full" zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Zones */}
          {zones.map((zone: any) => {
            if (!zone.active) return null;
            try {
              const geo = JSON.parse(zone.geoJson);
              const coords: [number, number][] = geo.coordinates[0].map(([lng, lat]: number[]) => [lat, lng]);
              return (
                <Polygon
                  key={zone.id}
                  positions={coords}
                  pathOptions={{ color: zone.kind === 'restricted' ? '#ef4444' : '#22c55e', fillOpacity: 0.2 }}
                />
              );
            } catch { return null; }
          })}

          {/* Target overlay from level */}
          {overlay?.type === 'Polygon' && (
            <Polygon
              positions={overlay.coordinates[0].map(([lng, lat]: number[]) => [lat, lng] as [number, number])}
              pathOptions={{ color: '#f59e0b', fillOpacity: 0.25, dashArray: '8 4' }}
            />
          )}

          {/* Player position */}
          {pos && (
            <>
              <Marker position={[pos.latitude, pos.longitude]} />
              <Circle
                center={[pos.latitude, pos.longitude]}
                radius={pos.accuracy}
                pathOptions={{ color: '#6366f1', fillOpacity: 0.1 }}
              />
              <LocateMe pos={pos} />
            </>
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 bg-gray-900 border-t border-gray-800 text-xs text-gray-400">
        <span><span className="text-green-400">■</span> Play zone</span>
        <span><span className="text-red-400">■</span> Restricted</span>
        {overlay && <span><span className="text-yellow-400">■</span> Target area</span>}
      </div>
    </div>
  );
}
