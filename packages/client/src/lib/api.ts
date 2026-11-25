const BASE = '/api/v1';

function getAuthToken(): string | undefined {
  try {
    const raw = localStorage.getItem('ch-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token;
    }
  } catch {}
  return undefined;
}

async function request<T>(path: string, init?: RequestInit, retries = 1): Promise<T> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> ?? {}),
  };

  try {
    const res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers,
      ...init,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    // If it's a transient network failure (e.g. cellular glitch or temporary socket drop) and retries remain, retry once
    if (
      retries > 0 &&
      (err.name === 'TypeError' ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('Load failed'))
    ) {
      await new Promise((r) => setTimeout(r, 350));
      return request<T>(path, init, retries - 1);
    }
    throw err;
  }
}

export const api = {
  // Auth
  teamLogin: (name: string, code: string) =>
    request<{ teamId: number; teamName: string; token?: string }>('/auth/team/login', {
      method: 'POST',
      body: JSON.stringify({ name, code }),
    }),
  registerTeam: (name: string, leaderName: string, mobile: string, code: string) =>
    request<{ teamId: number; teamName: string; leaderName?: string; mobile?: string; token?: string }>('/auth/team/register', {
      method: 'POST',
      body: JSON.stringify({ name, leaderName, mobile, code }),
    }),
  getRegistrationStatus: () =>
    request<{
      registrationOpen: boolean;
      gameStatus: string;
      registeredTeams: number;
      maxTeams: number;
      slotsRemaining: number;
    }>('/auth/registration/status'),
  adminLogin: (username: string, password: string) =>
    request<{ role: string; token?: string }>('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Participant
  getParticipantGame: () => request<any>('/participant/game'),
  reachLocation: (levelId: number, lat: number, lng: number) =>
    request<any>(`/participant/levels/${levelId}/reach-location`, {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),
  submitAnswer: (levelId: number, answer: string) =>
    request<any>(`/participant/levels/${levelId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  revealHint: (levelId: number, hintOrder: number) =>
    request<{ text: string; penaltyMins: number }>(
      `/participant/levels/${levelId}/hints/${hintOrder}/reveal`,
      { method: 'POST' },
    ),
  claimCheckpoint: (checkpointId: number, body: object) =>
    request<any>(`/participant/checkpoints/${checkpointId}/claim`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Leaderboard (public)
  getLeaderboard: () => request<{ rankings: any[] }>('/leaderboard'),
  getSpectatorState: () => request<any>('/leaderboard/spectator/state'),

  // Admin Operations & Emergency Failsafes
  getAdminTeams: () => request<any[]>('/admin/teams'),
  createTeam: (name: string, code: string, leaderName?: string, mobile?: string) =>
    request<any>('/admin/teams', { method: 'POST', body: JSON.stringify({ name, code, leaderName, mobile }) }),
  resetTeamAccessCode: (teamId: number, code?: string) =>
    request<{ ok: boolean; teamId: number; teamName: string; displayCode: string }>(
      `/admin/teams/${teamId}/code`,
      { method: 'PATCH', body: JSON.stringify({ code }) },
    ),
  deleteTeam: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}`, { method: 'DELETE' }),
  resetTeamProgress: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/reset`, { method: 'POST' }),
  verifyTeamFinish: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/verify-finish`, { method: 'POST' }),
  bypassTeamGps: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/bypass-gps`, { method: 'POST' }),
  forceAdvanceTeam: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/force-advance`, { method: 'POST' }),
  jumpTeamStage: (teamId: number, targetStepNumber: number) =>
    request<any>(`/admin/teams/${teamId}/jump-stage`, { method: 'POST', body: JSON.stringify({ targetStepNumber }) }),
  forceUnlockLevel: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/force-unlock`, { method: 'POST' }),
  forceCompleteLevel: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/force-complete`, { method: 'POST' }),
  getGames: () => request<any[]>('/games'),
  patchGameStatus: (id: number | undefined, action: string) => {
    const url = id ? `/games/${id}/status` : '/games/status';
    return request(url, { method: 'PATCH', body: JSON.stringify({ action }) });
  },
  sendAnnouncement: (gameId: number, message: string, kind: string, targetTeamId?: number) =>
    request(`/games/${gameId}/announcements`, {
      method: 'POST',
      body: JSON.stringify({ message, kind, targetTeamId }),
    }),
  getLevels: (gameId: number) => request<any[]>(`/levels/game/${gameId}`),
  generateFiestaPack: (gameId: number) => request<any>(`/levels/game/${gameId}/generate-fiesta-pack`, { method: 'POST' }),
  generate26Pack: (gameId: number) => request<any>(`/levels/game/${gameId}/generate-25-pack`, { method: 'POST' }),
  deployPool: (gameId: number, poolClues: any[]) =>
    request<{ ok: boolean; count: number; levels: any[] }>(`/levels/game/${gameId}/deploy-pool`, {
      method: 'POST',
      body: JSON.stringify({ poolClues }),
    }),
  createLevel: (gameId: number, data: any) =>
    request<any>(`/levels/game/${gameId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateLevel: (id: number, data: any) =>
    request<any>(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLevel: (id: number) => request<any>(`/levels/${id}`, { method: 'DELETE' }),
  getOccupancyMatrix: (gameId: number) => request<any[]>(`/games/${gameId}/occupancy`),
  updateGameSettings: (gameId: number, settings: { registrationOpen?: boolean; maxTeams?: number }) =>
    request<any>(`/games/${gameId}/settings`, { method: 'PATCH', body: JSON.stringify(settings) }),
  getZones: (gameId: number) => request<any[]>(`/zones/game/${gameId}`),
  createZone: (gameId: number, data: any) =>
    request<any>(`/zones/game/${gameId}`, { method: 'POST', body: JSON.stringify(data) }),
  toggleZone: (zoneId: number) => request(`/zones/${zoneId}/toggle`, { method: 'PATCH' }),
  deleteZone: (zoneId: number) => request(`/zones/${zoneId}`, { method: 'DELETE' }),
  updateMapSettings: (data: { campusMapUrl?: string; campusMapBounds?: string }) =>
    request<any>('/admin/map-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  adjustTeamPenalty: (teamId: number, minutes: number, note?: string) =>
    request<any>(`/admin/teams/${teamId}/penalty`, {
      method: 'POST',
      body: JSON.stringify({ minutes, note }),
    }),
  getAdminPhotos: () => request<any[]>('/admin/photos'),
  reviewPhoto: (id: number, status: string, reviewNote?: string) =>
    request<any>(`/admin/photos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewNote }),
    }),
  getAdminStats: () => request<any>('/admin/stats'),
  uploadPhoto: async (formData: FormData) => {
    const token = getAuthToken();
    const res = await fetch('/api/v1/participant/photos', {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Upload failed with HTTP ${res.status}`);
    }
    return res.json();
  },
};
