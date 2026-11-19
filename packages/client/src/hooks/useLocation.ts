import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../stores/gameStore';

export function useLocation() {
  const [pos, setPos] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const game = useGameStore((s) => s.game);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    const socket = getSocket();

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setPos(position.coords);
        if (game?.status === 'running') {
          socket.emit('location:update', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [game?.status]);

  return { pos, error };
}
