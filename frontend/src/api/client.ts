import type { Tournament, CreateTournamentRequest } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listTournaments: () => request<Tournament[]>('/tournaments'),

  getTournament: (id: string) => request<Tournament>(`/tournaments/${id}`),

  createTournament: (data: CreateTournamentRequest) =>
    request<Tournament>('/tournaments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateScore: (tournamentId: string, matchId: string, team1Score: number, team2Score: number) =>
    request<Tournament>(`/tournaments/${tournamentId}/matches/${matchId}/score`, {
      method: 'PUT',
      body: JSON.stringify({ team1Score, team2Score }),
    }),

  generateNextSwissRound: (tournamentId: string) =>
    request<Tournament>(`/tournaments/${tournamentId}/swiss/next-round`, {
      method: 'POST',
    }),

  deleteTournament: (id: string) =>
    request<void>(`/tournaments/${id}`, { method: 'DELETE' }),
};
