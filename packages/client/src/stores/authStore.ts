import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  teamId: number | null;
  teamName: string | null;
  role: 'team' | 'admin' | null;
  token: string | null;
  setTeam: (id: number, name: string, token: string) => void;
  setAdmin: (token: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      teamId: null,
      teamName: null,
      role: null,
      token: null,
      setTeam: (teamId, teamName, token) => set({ teamId, teamName, role: 'team', token }),
      setAdmin: (token) => set({ teamId: null, teamName: null, role: 'admin', token }),
      clear: () => set({ teamId: null, teamName: null, role: null, token: null }),
    }),
    { name: 'ch-auth' },
  ),
);
