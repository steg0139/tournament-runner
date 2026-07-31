export type Sport = 'basketball' | 'cornhole' | 'other';

export type TournamentFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin'
  | 'swiss';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';
export type TournamentType = 'single' | 'multi_stage';
export type StageStatus = 'pending' | 'in_progress' | 'completed';
export type GroupStatus = 'pending' | 'in_progress' | 'completed';
export type TeamStageStatus = 'active' | 'eliminated' | 'advanced';

export interface Team {
  id: string;
  name: string;
  seed?: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  stageId?: string;
  groupId?: string;
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

export interface Group {
  id: string;
  stageId: string;
  name: string;
  teamIds: string[];
  status: GroupStatus;
  currentRound: number;
}

export interface TeamStageInfo {
  teamId: string;
  groupId: string;
  status: TeamStageStatus;
  wins: number;
  losses: number;
  byesReceived: number;
}

export interface Stage {
  id: string;
  position: number;
  name: string;
  format: TournamentFormat;
  status: StageStatus;
  groupCount: number;
  eliminationThreshold?: number;
  advancementCount?: number;
  winsToAdvance?: number;
  courts?: number;
  groups: Group[];
  matches: Match[];
  teamStageInfo: TeamStageInfo[];
  advancedTeamIds: string[];
}

export interface Tournament {
  id: string;
  type?: 'single';
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

export interface MultiStageTournament {
  id: string;
  type: 'multi_stage';
  name: string;
  sport: Sport;
  status: TournamentStatus;
  teams: Team[];
  stages: Stage[];
  currentStageId: string;
  championId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnyTournament = Tournament | MultiStageTournament;

export interface CreateTournamentRequest {
  name: string;
  sport: Sport;
  format: TournamentFormat;
  teams?: { name: string; seed?: number }[];
}

export interface CreateMultiStageTournamentRequest {
  name: string;
  sport: Sport;
  teams?: { name: string; seed?: number }[];
  stages: {
    name: string;
    format: TournamentFormat;
    groupCount: number;
    eliminationThreshold?: number;
    advancementCount?: number;
    winsToAdvance?: number;
    courts?: number;
  }[];
}

export function isMultiStage(t: AnyTournament): t is MultiStageTournament {
  return t.type === 'multi_stage';
}
