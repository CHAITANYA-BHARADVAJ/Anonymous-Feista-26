import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { api } from '../lib/api';
import { playClueUnlockedSound, triggerHaptic } from '../lib/sound';
import {
  announceGameEnded,
  announceGamePaused,
  announceGameResumed,
  announceGameStarted,
  announceVerifiedFinish,
} from '../lib/voice';

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const { setGame, setProgress, setRankings, addAnnouncement, setConnected } = useGameStore();
  const syncingRef = useRef(false);

  useEffect(() => {
    const socket = getSocket(token ?? undefined);

    // Instant real-time participant synchronization
    const syncParticipantData = async (shouldAlert = false) => {
      if (useAuthStore.getState().role !== 'team') return;
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const data = await api.getParticipantGame();
        setGame(data.game);
        setProgress(data.progress);
        if (shouldAlert) {
          playClueUnlockedSound();
          triggerHaptic();
        }
      } catch (err) {
        // silent fail if temporarily unauthenticated
      } finally {
        syncingRef.current = false;
      }
    };

    socket.on('connect', async () => {
      setConnected(true);
      if (role === 'team') {
        await syncParticipantData(false);
      }
      try {
        const { rankings } = await api.getLeaderboard();
        setRankings(rankings);
      } catch {}
    });

    socket.on('disconnect', () => setConnected(false));

    // When admin starts, pauses, resumes, ends, or resets game: reflect immediately!
    const handleGameStatus = async (data: any) => {
      const current = useGameStore.getState().game;
      const prevStatus = current?.status;
      if (current) setGame({ ...current, ...data });
      else if (data?.game) setGame(data.game);

      if (role === 'team') {
        const nextStatus = data?.status ?? data?.game?.status;
        let spokeStatus = false;
        if (nextStatus && nextStatus !== prevStatus) {
          if (nextStatus === 'running') {
            if (prevStatus === 'paused') announceGameResumed();
            else announceGameStarted();
            spokeStatus = true;
          } else if (nextStatus === 'paused') {
            announceGamePaused();
            spokeStatus = true;
          } else if (nextStatus === 'ended') {
            announceGameEnded();
            spokeStatus = true;
          }
        }
        const shouldChime = nextStatus === 'running' && !spokeStatus;
        await syncParticipantData(shouldChime);
      }
    };

    socket.on('game:status_changed', handleGameStatus);
    socket.on('game:status', handleGameStatus);
    socket.on('game:started', handleGameStatus);

    socket.on('game:announcement', (data: any) => {
      addAnnouncement(data);
      triggerHaptic();
    });

    // Real-time clue dispatch & unlocks (admin advance, kickoff, answer completed)
    socket.on('level:unlocked', async () => {
      await syncParticipantData(true);
    });

    socket.on('clue:decrypted', async () => {
      await syncParticipantData(true);
    });

    socket.on('level:auto_unlocked', async () => {
      await syncParticipantData(true);
    });

    socket.on('team:verified_finish', async () => {
      await syncParticipantData(true);
      announceVerifiedFinish(useAuthStore.getState().teamName);
      try {
        const { rankings } = await api.getLeaderboard();
        setRankings(rankings);
      } catch {}
    });

    socket.on('team:penalty_applied', async () => {
      await syncParticipantData(false);
    });

    socket.on('leaderboard:updated', ({ rankings }: { rankings: any[] }) => {
      setRankings(rankings);
    });

    // Immediate auto-resync when operative unlocks their phone or switches back to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (useAuthStore.getState().role === 'team') {
          syncParticipantData(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('game:status_changed', handleGameStatus);
      socket.off('game:status', handleGameStatus);
      socket.off('game:started');
      socket.off('game:announcement');
      socket.off('level:unlocked');
      socket.off('clue:decrypted');
      socket.off('level:auto_unlocked');
      socket.off('team:verified_finish');
      socket.off('team:penalty_applied');
      socket.off('leaderboard:updated');
    };
  }, [token, role]);
}
