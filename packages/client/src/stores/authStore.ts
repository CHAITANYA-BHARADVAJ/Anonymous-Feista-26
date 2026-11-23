import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  teamId: number | null;
  teamName: string | null;
  role: 'team' | 'admin' | null;
  token: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setTeam: (id: number, name: string, token: string) => void;
  setAdmin: (token: string) => void;
  clear: () => void;
}

// Synchronously restore authentication state from localStorage during script evaluation.
// This prevents flash-of-unauthenticated state and wrongful redirection to /login on page refresh.
function getInitialAuthState(): {
  teamId: number | null;
  teamName: string | null;
  role: 'team' | 'admin' | null;
  token: string | null;
} {
  if (typeof window === 'undefined') {
    return { teamId: null, teamName: null, role: null, token: null };
  }
  try {
    const raw = localStorage.getItem('ch-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      const s = parsed?.state;
      if (s && (s.role === 'team' || s.role === 'admin')) {
        return {
          teamId: s.teamId ?? null,
          teamName: s.teamName ?? null,
          role: s.role,
          token: s.token ?? null,
        };
      }
    }
  } catch {}
  return { teamId: null, teamName: null, role: null, token: null };
}

const initial = getInitialAuthState();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      teamId: initial.teamId,
      teamName: initial.teamName,
      role: initial.role,
      token: initial.token,
      hasHydrated: initial.role !== null,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTeam: (teamId, teamName, token) => set({ teamId, teamName, role: 'team', token, hasHydrated: true }),
      setAdmin: (token) => set({ teamId: null, teamName: null, role: 'admin', token, hasHydrated: true }),
      clear: () => set({ teamId: null, teamName: null, role: null, token: null, hasHydrated: true }),
    }),
    {
      name: 'ch-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
