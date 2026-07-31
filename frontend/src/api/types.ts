export type Sport = 'basketball' | 'cornhole' | 'other';

export type TournamentFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin'
  | 'swiss';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';

export interface Team {
  id: string;
  name: string;
  seed?: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  team1Id: string | null;
  team2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerId: string | null;
  loserId: string | null;
  bracket: 'winners' | 'losers' | 'finals' | 'round_robin' | 'swiss';
  status: 'pending' | 'in_progress' | 'completed';
  nextMatchId: string | null;
  nextMatchSlot: 'team1' | 'team2' | null;
}

export interface Tournament {
  id: string;
  name: string;
  sport: Sport;
  format: TournamentFormat;
  status: TournamentStatus;
  teams: Team[];
  matches: Match[];
  currentRound: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTournamentRequest {
  name: string;
  sport: Sport;
  format: TournamentFormat;
  teams: { name: string; seed?: number }[];
}
