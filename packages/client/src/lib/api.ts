const BASE = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  teamLogin: (name: string, code: string) =>
    request<{ teamId: number; teamName: string }>('/auth/team/login', {
      method: 'POST',
      body: JSON.stringify({ name, code }),
    }),
  adminLogin: (username: string, password: string) =>
    request<{ role: string }>('/auth/admin/login', {
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
  sendSOS: (lat: number, lng: number) =>
    request('/participant/sos', { method: 'POST', body: JSON.stringify({ lat, lng }) }),

  // Leaderboard (public)
  getLeaderboard: () => request<{ rankings: any[] }>('/leaderboard'),
  getSpectatorState: () => request<any>('/leaderboard/spectator/state'),

  // Admin Operations & Emergency Failsafes
  getAdminTeams: () => request<any[]>('/admin/teams'),
  createTeam: (name: string, code: string) =>
    request<any>('/admin/teams', { method: 'POST', body: JSON.stringify({ name, code }) }),
  deleteTeam: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}`, { method: 'DELETE' }),
  resetTeamProgress: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/reset`, { method: 'POST' }),
  verifyTeamFinish: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/verify-finish`, { method: 'POST' }),
  forceUnlockLevel: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/force-unlock`, { method: 'POST' }),
  forceCompleteLevel: (teamId: number) =>
    request<any>(`/admin/teams/${teamId}/force-complete`, { method: 'POST' }),
  getSosAlerts: () => request<any[]>('/admin/sos'),
  getGames: () => request<any[]>('/games'),
  patchGameStatus: (id: number, action: string) =>
    request(`/games/${id}/status`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  sendAnnouncement: (gameId: number, message: string, kind: string, targetTeamId?: number) =>
    request(`/games/${gameId}/announcements`, {
      method: 'POST',
      body: JSON.stringify({ message, kind, targetTeamId }),
    }),
  getLevels: (gameId: number) => request<any[]>(`/levels/game/${gameId}`),
  createLevel: (gameId: number, data: any) =>
    request<any>(`/levels/game/${gameId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateLevel: (id: number, data: any) =>
    request<any>(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLevel: (id: number) => request<any>(`/levels/${id}`, { method: 'DELETE' }),
  getZones: (gameId: number) => request<any[]>(`/zones/game/${gameId}`),
  createZone: (gameId: number, data: any) =>
    request<any>(`/zones/game/${gameId}`, { method: 'POST', body: JSON.stringify(data) }),
  toggleZone: (zoneId: number) => request(`/zones/${zoneId}/toggle`, { method: 'PATCH' }),
  deleteZone: (zoneId: number) => request(`/zones/${zoneId}`, { method: 'DELETE' }),
  updateMapSettings: (data: { campusMapUrl?: string; campusMapBounds?: string }) =>
    request<any>('/admin/map-settings', { method: 'PATCH', body: JSON.stringify(data) }),
};
