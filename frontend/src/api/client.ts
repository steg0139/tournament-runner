import type { AnyTournament, Tournament, MultiStageTournament, CreateTournamentRequest, CreateMultiStageTournamentRequest, Stage } from './types';

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
  listTournaments: () => request<AnyTournament[]>('/tournaments'),

  getTournament: (id: string) => request<AnyTournament>(`/tournaments/${id}`),

  createTournament: (data: CreateTournamentRequest) =>
    request<Tournament>('/tournaments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createMultiStageTournament: (data: CreateMultiStageTournamentRequest) =>
    request<MultiStageTournament>('/tournaments/multi-stage', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateScore: (tournamentId: string, matchId: string, team1Score: number, team2Score: number) =>
    request<AnyTournament>(`/tournaments/${tournamentId}/matches/${matchId}/score`, {
      method: 'PUT',
      body: JSON.stringify({ team1Score, team2Score }),
    }),

  editScore: (tournamentId: string, matchId: string, team1Score: number, team2Score: number) =>
    request<AnyTournament>(`/tournaments/${tournamentId}/matches/${matchId}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ team1Score, team2Score }),
    }),

  generateNextSwissRound: (tournamentId: string) =>
    request<Tournament>(`/tournaments/${tournamentId}/swiss/next-round`, {
      method: 'POST',
    }),

  generateGroupNextRound: (tournamentId: string, stageId: string, groupId: string) =>
    request<MultiStageTournament>(
      `/tournaments/${tournamentId}/stages/${stageId}/groups/${groupId}/next-round`,
      { method: 'POST' }
    ),

  getStageDetails: (tournamentId: string, stageId: string) =>
    request<Stage>(`/tournaments/${tournamentId}/stages/${stageId}`),

  advanceStage: (tournamentId: string, stageId: string) =>
    request<MultiStageTournament>(
      `/tournaments/${tournamentId}/stages/${stageId}/advance`,
      { method: 'POST' }
    ),

  // Team management (setup state)
  addTeams: (tournamentId: string, teams: { name: string; seed?: number }[]) =>
    request<AnyTournament>(`/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      body: JSON.stringify({ teams }),
    }),

  addMultiStageTeams: (tournamentId: string, teams: { name: string; seed?: number }[]) =>
    request<MultiStageTournament>(`/tournaments/${tournamentId}/multi-stage/teams`, {
      method: 'POST',
      body: JSON.stringify({ teams }),
    }),

  removeTeam: (tournamentId: string, teamId: string) =>
    request<AnyTournament>(`/tournaments/${tournamentId}/teams/${teamId}`, {
      method: 'DELETE',
    }),

  removeMultiStageTeam: (tournamentId: string, teamId: string) =>
    request<MultiStageTournament>(`/tournaments/${tournamentId}/multi-stage/teams/${teamId}`, {
      method: 'DELETE',
    }),

  startTournament: (tournamentId: string) =>
    request<AnyTournament>(`/tournaments/${tournamentId}/start`, {
      method: 'POST',
    }),

  startMultiStageTournament: (tournamentId: string) =>
    request<MultiStageTournament>(`/tournaments/${tournamentId}/multi-stage/start`, {
      method: 'POST',
    }),

  deleteTournament: (id: string) =>
    request<void>(`/tournaments/${id}`, { method: 'DELETE' }),
};
