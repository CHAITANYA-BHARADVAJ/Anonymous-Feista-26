import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { useGameStore } from '../stores/gameStore';
import { requestScreenWakeLock, releaseScreenWakeLock } from '../lib/wakeLock';

export function useLocation() {
  const [pos, setPos] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const game = useGameStore((s) => s.game);

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPos(position.coords);
        const socket = getSocket();
        if (game?.status === 'running') {
          socket.emit('location:update', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    );
  }, [game?.status]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device');
      return;
    }

    if (game?.status === 'running') {
      requestScreenWakeLock();
    } else {
      releaseScreenWakeLock();
    }

    const socket = getSocket();

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setPos(position.coords);
        setError(null);
        if (game?.status === 'running') {
          socket.emit('location:update', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      releaseScreenWakeLock();
    };
  }, [game?.status]);

  return { pos, error, refreshLocation };
}
