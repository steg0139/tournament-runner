import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Tournament, Match } from '../api/types';
import { BracketView } from '../components/BracketView';
import { RoundRobinView } from '../components/RoundRobinView';
import { ScoreModal } from '../components/ScoreModal';

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const fetchTournament = () => {
    if (!id) return;
    api
      .getTournament(id)
      .then(setTournament)
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
    if (!tournament) return;
    try {
      const updated = await api.generateNextSwissRound(tournament.id);
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

  const isSwiss = tournament.format === 'swiss';
  const isRoundRobin = tournament.format === 'round_robin';
  const isElimination =
    tournament.format === 'single_elimination' ||
    tournament.format === 'double_elimination';

  // Swiss: check if current round is complete
  const currentRoundMatches = tournament.matches.filter(
    (m) => m.round === tournament.currentRound
  );
  const currentRoundComplete =
    isSwiss && currentRoundMatches.every((m) => m.status === 'completed');

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
          <div className="flex gap-2">
            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
              {tournament.sport}
            </span>
            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
              {formatLabel(tournament.format)}
            </span>
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
        </div>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-sm border border-red-800 px-3 py-2 rounded-lg hover:bg-red-900/30 transition-colors"
        >
          Delete Tournament
        </button>
      </div>

      {/* Swiss: next round button */}
      {isSwiss && currentRoundComplete && tournament.status !== 'completed' && (
        <div className="mb-6">
          <button
            onClick={handleNextSwissRound}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Generate Next Round
          </button>
        </div>
      )}

      {/* Bracket/match display */}
      {isElimination && (
        <BracketView
          tournament={tournament}
          getTeamName={getTeamName}
          onMatchClick={setSelectedMatch}
        />
      )}

      {isRoundRobin && (
        <RoundRobinView
          tournament={tournament}
          getTeamName={getTeamName}
          onMatchClick={setSelectedMatch}
        />
      )}

      {isSwiss && (
        <RoundRobinView
          tournament={tournament}
          getTeamName={getTeamName}
          onMatchClick={setSelectedMatch}
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
