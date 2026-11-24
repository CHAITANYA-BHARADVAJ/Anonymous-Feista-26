import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PaTone = 'pa' | 'alert' | 'finale' | 'success';

interface VoiceState {
  muted: boolean;
  isSpeaking: boolean;
  activeCaption: string | null;
  activeTone: PaTone;
  autoplayBlocked: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setSpeakingState: (isSpeaking: boolean, caption?: string | null, tone?: PaTone) => void;
  setAutoplayBlocked: (blocked: boolean) => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set, get) => ({
      muted: false,
      isSpeaking: false,
      activeCaption: null,
      activeTone: 'pa',
      autoplayBlocked: false,
      setMuted: (muted) => set({ muted }),
      toggleMute: () => set({ muted: !get().muted }),
      setSpeakingState: (isSpeaking, caption = null, tone = 'pa') =>
        set({
          isSpeaking,
          activeCaption: isSpeaking ? caption : null,
          activeTone: tone,
        }),
      setAutoplayBlocked: (autoplayBlocked) => set({ autoplayBlocked }),
    }),
    {
      name: 'ch-voice-prefs',
      partialize: (state) => ({ muted: state.muted }),
    },
  ),
);
