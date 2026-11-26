import { create } from 'zustand';

export interface LevelProgress {
  id: number;
  levelId: number;
  stepNumber?: number;
  unlockedAt: string;
  locationReachedAt: string | null;
  completedAt: string | null;
  hintsUsed: number;
  freeHintsRemaining?: number;
  hintReveals: { hintId: number }[];
  level: {
    id: number;
    orderIndex: number;
    title: string;
    clueText: string;
    clueLocked?: boolean;
    locationHint: string;
    requiresAnswer?: boolean;
    answer?: string;
    targetLat: number | null;
    targetLng: number | null;
    triggerRadiusMeters: number | null;
    durationSecs: number | null;
    isFinal: boolean;
    mapOverlayGeoJson: string | null;
    socialLinks: { platform: string; url: string }[];
    hints: { id: number; orderIndex: number; text?: string; penaltyMins: number; revealed?: boolean }[];
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
  endedAt?: string | null;
  campusMapUrl?: string | null;
  campusMapBounds?: string | null;
  zones: any[];
}

export interface StageSplitEntry {
  stepNumber: number;
  title: string;
  isFinal: boolean;
  unlockedAt: string;
  locationReachedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  hintsUsed: number;
  durationSecs: number | null;
}

export interface PenaltyLogEntry {
  id: number;
  kind: string;
  minutes: number;
  appliedAt: string;
}

export interface Ranking {
  rank: number;
  teamId: number;
  teamName: string;
  currentLevel: number;
  totalSteps: number;
  completedStages: number;
  currentStageTitle: string;
  locationReached: boolean;
  rawElapsedSecs: number | null;
  adjustedTimeSecs: number | null;
  hintPenaltyMins: number;
  zonePenaltyMins: number;
  adminPenaltyMins: number;
  bonusMins: number;
  totalPenaltyMins: number;
  netAdjustmentMins: number;
  hintsUsedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  latestPhotoStatus: string | null;
  finished: boolean;
  stageBreakdown: StageSplitEntry[];
  penaltyLog: PenaltyLogEntry[];
}

export interface LatestPhoto {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  reviewNote?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
}

interface GameStoreState {
  game: GameState | null;
  progress: LevelProgress[];
  totalSteps: number;
  latestPhoto: LatestPhoto | null;
  rankings: Ranking[];
  announcements: { kind: string; message: string; sentAt: string }[];
  connected: boolean;
  setGame: (g: GameState) => void;
  setProgress: (p: LevelProgress[]) => void;
  setTotalSteps: (total: number) => void;
  setLatestPhoto: (p: LatestPhoto | null) => void;
  setRankings: (r: Ranking[]) => void;
  addAnnouncement: (a: { kind: string; message: string; sentAt: string }) => void;
  setConnected: (v: boolean) => void;
  currentLevel: () => LevelProgress | undefined;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  game: null,
  progress: [],
  totalSteps: 11,
  latestPhoto: null,
  rankings: [],
  announcements: [],
  connected: false,
  setGame: (game) => set({ game }),
  setProgress: (progress) => set({ progress }),
  setTotalSteps: (totalSteps) => set({ totalSteps }),
  setLatestPhoto: (latestPhoto) => set({ latestPhoto }),
  setRankings: (rankings) => set({ rankings }),
  addAnnouncement: (a) =>
    set((s) => ({ announcements: [a, ...s.announcements].slice(0, 10) })),
  setConnected: (connected) => set({ connected }),
  currentLevel: () => {
    const { progress } = get();
    const unlocked = progress.filter((p) => p.unlockedAt);
    return (
      unlocked.find((p) => !p.completedAt) ??
      unlocked[unlocked.length - 1]
    );
  },
}));
