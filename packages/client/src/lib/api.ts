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
  uploadPhoto: (file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return fetch(`${BASE}/participant/final-photo`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    }).then((r) => r.json());
  },

  // Leaderboard (public)
  getLeaderboard: () => request<{ rankings: any[] }>('/leaderboard'),
  getSpectatorState: () => request<any>('/leaderboard/spectator/state'),

  // Admin
  getAdminTeams: () => request<any[]>('/admin/teams'),
  getPhotos: () => request<any[]>('/admin/photos'),
  reviewPhoto: (id: number, status: 'approved' | 'rejected', reviewNote?: string) =>
    request(`/admin/photos/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote }) }),
  getSosAlerts: () => request<any[]>('/admin/sos'),
  getGames: () => request<any[]>('/games'),
  patchGameStatus: (id: number, action: string) =>
    request(`/games/${id}/status`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  sendAnnouncement: (gameId: number, message: string, kind: string, targetTeamId?: number) =>
    request(`/games/${gameId}/announcements`, {
      method: 'POST',
      body: JSON.stringify({ message, kind, targetTeamId }),
    }),
  getZones: (gameId: number) => request<any[]>(`/zones/game/${gameId}`),
  toggleZone: (zoneId: number) => request(`/zones/${zoneId}/toggle`, { method: 'PATCH' }),
};
