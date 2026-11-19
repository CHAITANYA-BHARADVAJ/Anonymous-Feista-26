import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { api } from '../lib/api';

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const { setGame, setProgress, setRankings, addAnnouncement, setConnected, game } = useGameStore();

  useEffect(() => {
    const socket = getSocket(token ?? undefined);

    socket.on('connect', async () => {
      setConnected(true);
      // Resync on reconnect
      if (role === 'team') {
        try {
          const data = await api.getParticipantGame();
          setGame(data.game);
          setProgress(data.progress);
        } catch {/* unauthenticated */}
      }
      try {
        const { rankings } = await api.getLeaderboard();
        setRankings(rankings);
      } catch {/* ignore */}
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('game:status_changed', (data: any) => {
      setGame({ ...game!, ...data });
    });

    socket.on('game:announcement', (data: any) => {
      addAnnouncement(data);
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    });

    socket.on('level:unlocked', async () => {
      if (role === 'team') {
        const data = await api.getParticipantGame();
        setProgress(data.progress);
      }
    });

    socket.on('level:auto_unlocked', async () => {
      if (role === 'team') {
        const data = await api.getParticipantGame();
        setProgress(data.progress);
      }
    });

    socket.on('leaderboard:updated', ({ rankings }: { rankings: any[] }) => {
      setRankings(rankings);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('game:status_changed');
      socket.off('game:announcement');
      socket.off('level:unlocked');
      socket.off('level:auto_unlocked');
      socket.off('leaderboard:updated');
    };
  }, [token, role]);
}
