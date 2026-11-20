import { create } from 'zustand';

export interface LevelProgress {
  id: number;
  levelId: number;
  unlockedAt: string;
  locationReachedAt: string | null;
  completedAt: string | null;
  hintsUsed: number;
  hintReveals: { hintId: number }[];
  level: {
    id: number;
    orderIndex: number;
    title: string;
    clueText: string;
    locationHint: string;
    answer: string;
    targetLat: number | null;
    targetLng: number | null;
    triggerRadiusMeters: number | null;
    durationSecs: number | null;
    isFinal: boolean;
    mapOverlayGeoJson: string | null;
    socialLinks: { platform: string; url: string }[];
    hints: { id: number; orderIndex: number; text: string; penaltyMins: number }[];
    checkpoints: any[];
  };
}

export interface GameState {
  id: number;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'ended';
  startedAt: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
  campusMapUrl?: string | null;
  campusMapBounds?: string | null;
  zones: any[];
}

export interface Ranking {
  rank: number;
  teamId: number;
  teamName: string;
  currentLevel: number;
  adjustedTimeSecs: number | null;
  finished: boolean;
}

interface GameStoreState {
  game: GameState | null;
  progress: LevelProgress[];
  rankings: Ranking[];
  announcements: { kind: string; message: string; sentAt: string }[];
  connected: boolean;
  setGame: (g: GameState) => void;
  setProgress: (p: LevelProgress[]) => void;
  setRankings: (r: Ranking[]) => void;
  addAnnouncement: (a: { kind: string; message: string; sentAt: string }) => void;
  setConnected: (v: boolean) => void;
  currentLevel: () => LevelProgress | undefined;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,
  progress: [],
  rankings: [],
  announcements: [],
  connected: false,
  setGame: (game) => set({ game }),
  setProgress: (progress) => set({ progress }),
  setRankings: (rankings) => set({ rankings }),
  addAnnouncement: (a) =>
    set((s) => ({ announcements: [a, ...s.announcements].slice(0, 10) })),
  setConnected: (connected) => set({ connected }),
  currentLevel: () => {
    const { progress } = get();
    // Last unlocked level that isn't completed, or last completed if all done
    const unlocked = progress.filter((p) => p.unlockedAt);
    return (
      unlocked.find((p) => !p.completedAt) ??
      unlocked[unlocked.length - 1]
    );
  },
}));
