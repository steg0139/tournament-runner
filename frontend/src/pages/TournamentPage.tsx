import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AnyTournament, MultiStageTournament, Tournament, Match } from '../api/types';
import { isMultiStage } from '../api/types';
import { BracketView } from '../components/BracketView';
import { RoundRobinView } from '../components/RoundRobinView';
import { ScoreModal } from '../components/ScoreModal';
import { StageNavigator } from '../components/StageNavigator';
import { GroupStandings } from '../components/GroupStandings';

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<AnyTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const fetchTournament = () => {
    if (!id) return;
    api
      .getTournament(id)
      .then((t) => {
        setTournament(t);
        if (isMultiStage(t) && !selectedStageId) {
          setSelectedStageId(t.currentStageId);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTournament();
  }, [id]);

  const handleScoreSubmit = async (team1Score: number, team2Score: number) => {
    if (!tournament || !selectedMatch) return;

    try {
      const updated = await api.updateScore(
        tournament.id,
        selectedMatch.id,
        team1Score,
        team2Score
      );
      setTournament(updated);
      setSelectedMatch(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleNextSwissRound = async () => {
    if (!tournament || isMultiStage(tournament)) return;
    try {
      const updated = await api.generateNextSwissRound(tournament.id);
      setTournament(updated);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleGroupNextRound = async (groupId: string) => {
    if (!tournament || !isMultiStage(tournament) || !selectedStageId) return;
    try {
      const updated = await api.generateGroupNextRound(tournament.id, selectedStageId, groupId);
      setTournament(updated);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!tournament) return;
    if (!confirm('Are you sure you want to delete this tournament?')) return;

    try {
      await api.deleteTournament(tournament.id);
      navigate('/');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId || !tournament) return 'TBD';
    const team = tournament.teams.find((t) => t.id === teamId);
    return team?.name || 'TBD';
  };

  if (loading) return <p className="text-gray-400">Loading...</p>;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (!tournament) return <p className="text-red-400">Tournament not found</p>;

  const formatLabel = (format: string) =>
    format.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{tournament.name}</h1>
          <div className="flex gap-2 flex-wrap">
            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
              {tournament.sport}
            </span>
            {isMultiStage(tournament) ? (
              <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-sm">
                Multi-Stage
              </span>
            ) : (
              <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
                {formatLabel(tournament.format)}
              </span>
            )}
            <span
              className={`px-2 py-1 rounded text-sm ${
                tournament.status === 'completed'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-yellow-900/50 text-yellow-400'
              }`}
            >
              {formatLabel(tournament.status)}
            </span>
          </div>
          {isMultiStage(tournament) && tournament.championId && (
            <p className="mt-2 text-lg text-green-400">
              🏆 Champion: {getTeamName(tournament.championId)}
            </p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-sm border border-red-800 px-3 py-2 rounded-lg hover:bg-red-900/30 transition-colors"
        >
          Delete Tournament
        </button>
      </div>

      {/* Setup state - add teams and start */}
      {tournament.status === 'setup' && (
        <SetupView
          tournament={tournament}
          onTournamentUpdate={setTournament}
        />
      )}

      {/* Multi-stage view */}
      {isMultiStage(tournament) && tournament.status !== 'setup' && (
        <MultiStageView
          tournament={tournament}
          selectedStageId={selectedStageId || tournament.currentStageId}
          onSelectStage={setSelectedStageId}
          onMatchClick={setSelectedMatch}
          onGenerateNextRound={handleGroupNextRound}
          getTeamName={getTeamName}
        />
      )}

      {/* Single-format view */}
      {!isMultiStage(tournament) && tournament.status !== 'setup' && (
        <SingleFormatView
          tournament={tournament}
          onMatchClick={setSelectedMatch}
          onNextSwissRound={handleNextSwissRound}
          getTeamName={getTeamName}
        />
      )}

      {/* Score entry modal */}
      {selectedMatch && (
        <ScoreModal
          match={selectedMatch}
          team1Name={getTeamName(selectedMatch.team1Id)}
          team2Name={getTeamName(selectedMatch.team2Id)}
          onSubmit={handleScoreSubmit}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}

function MultiStageView({
  tournament,
  selectedStageId,
  onSelectStage,
  onMatchClick,
  onGenerateNextRound,
  getTeamName,
}: {
  tournament: MultiStageTournament;
  selectedStageId: string;
  onSelectStage: (id: string) => void;
  onMatchClick: (match: Match) => void;
  onGenerateNextRound: (groupId: string) => void;
  getTeamName: (id: string | null) => string;
}) {
  const selectedStage = tournament.stages.find((s) => s.id === selectedStageId);
  if (!selectedStage) return null;

  const isSwissWithGroups = selectedStage.format === 'swiss' && selectedStage.groups.length > 0;
  const isElimination =
    selectedStage.format === 'single_elimination' ||
    selectedStage.format === 'double_elimination';
  const isRoundRobin = selectedStage.format === 'round_robin';

  // Build a virtual tournament object for BracketView/RoundRobinView
  const virtualTournament: Tournament = {
    id: tournament.id,
    name: tournament.name,
    sport: tournament.sport,
    format: selectedStage.format,
    status: selectedStage.status === 'completed' ? 'completed' : 'in_progress',
    teams: tournament.teams,
    matches: selectedStage.matches,
    currentRound: 1,
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  };

  return (
    <div>
      <StageNavigator
        stages={tournament.stages}
        currentStageId={tournament.currentStageId}
        selectedStageId={selectedStageId}
        onSelectStage={onSelectStage}
      />

      {isSwissWithGroups && (
        <GroupStandings
          stage={selectedStage}
          teams={tournament.teams}
          onGenerateNextRound={onGenerateNextRound}
          onMatchClick={onMatchClick}
        />
      )}

      {isElimination && (
        <BracketView
          tournament={virtualTournament}
          getTeamName={getTeamName}
          onMatchClick={onMatchClick}
        />
      )}

      {isRoundRobin && (
        <RoundRobinView
          tournament={virtualTournament}
          getTeamName={getTeamName}
          onMatchClick={onMatchClick}
        />
      )}
    </div>
  );
}

function SingleFormatView({
  tournament,
  onMatchClick,
  onNextSwissRound,
  getTeamName,
}: {
  tournament: Tournament;
  onMatchClick: (match: Match) => void;
  onNextSwissRound: () => void;
  getTeamName: (id: string | null) => string;
}) {
  const isSwiss = tournament.format === 'swiss';
  const isRoundRobin = tournament.format === 'round_robin';
  const isElimination =
    tournament.format === 'single_elimination' ||
    tournament.format === 'double_elimination';

  const currentRoundMatches = tournament.matches.filter(
    (m) => m.round === tournament.currentRound
  );
  const currentRoundComplete =
    isSwiss && currentRoundMatches.every((m) => m.status === 'completed');

  return (
    <div>
      {/* Swiss: next round button */}
      {isSwiss && currentRoundComplete && tournament.status !== 'completed' && (
        <div className="mb-6">
          <button
            onClick={onNextSwissRound}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Generate Next Round
          </button>
        </div>
      )}

      {isElimination && (
        <BracketView
          tournament={tournament}
          getTeamName={getTeamName}
          onMatchClick={onMatchClick}
        />
      )}

      {(isRoundRobin || isSwiss) && (
        <RoundRobinView
          tournament={tournament}
          getTeamName={getTeamName}
          onMatchClick={onMatchClick}
        />
      )}
    </div>
  );
}

function SetupView({
  tournament,
  onTournamentUpdate,
}: {
  tournament: AnyTournament;
  onTournamentUpdate: (t: AnyTournament) => void;
}) {
  const [teamInput, setTeamInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const handleAddTeams = async () => {
    const names = teamInput
      .split(/[,\n]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (names.length === 0) return;

    const newTeams = names.map((name) => ({ name }));

    try {
      let updated: AnyTournament;
      if (isMultiStage(tournament)) {
        updated = await api.addMultiStageTeams(tournament.id, newTeams);
      } else {
        updated = await api.addTeams(tournament.id, newTeams);
      }
      onTournamentUpdate(updated);
      setTeamInput('');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemoveTeam = async (teamId: string) => {
    try {
      let updated: AnyTournament;
      if (isMultiStage(tournament)) {
        updated = await api.removeMultiStageTeam(tournament.id, teamId);
      } else {
        updated = await api.removeTeam(tournament.id, teamId);
      }
      onTournamentUpdate(updated);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      let updated: AnyTournament;
      if (isMultiStage(tournament)) {
        updated = await api.startMultiStageTournament(tournament.id);
      } else {
        updated = await api.startTournament(tournament.id);
      }
      onTournamentUpdate(updated);
    } catch (e: any) {
      setError(e.message);
      setStarting(false);
    }
  };

  const minTeams = isMultiStage(tournament) ? 4 : 2;

  return (
    <div className="max-w-2xl">
      <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg px-4 py-3 mb-6">
        <p className="text-yellow-300 font-medium">Tournament is in setup mode</p>
        <p className="text-yellow-400/70 text-sm mt-1">
          Add teams below, then click "Start Tournament" when ready.
        </p>
      </div>

      {/* Add teams */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Add Teams ({tournament.teams.length} added)
        </label>
        <div className="flex gap-2 items-end">
          <textarea
            value={teamInput}
            onChange={(e) => setTeamInput(e.target.value)}
            placeholder="Enter team names separated by commas or new lines"
            rows={3}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-y"
          />
          <button
            onClick={handleAddTeams}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors h-fit"
          >
            Add
          </button>
        </div>
      </div>

      {/* Team list */}
      {tournament.teams.length > 0 && (
        <div className="mb-6 space-y-2">
          {tournament.teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
            >
              <span className="text-gray-500 text-sm w-6">#{team.seed}</span>
              <span className="flex-1">{team.name}</span>
              <button
                onClick={() => handleRemoveTeam(team.id)}
                className="text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 mb-6">
          {error}
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={tournament.teams.length < minTeams || starting}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-4 rounded-lg font-medium text-lg transition-colors"
      >
        {starting
          ? 'Starting...'
          : tournament.teams.length < minTeams
          ? `Need at least ${minTeams} teams to start`
          : `Start Tournament (${tournament.teams.length} teams)`}
      </button>
    </div>
  );
}
