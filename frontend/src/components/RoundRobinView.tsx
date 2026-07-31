import type { Tournament, Match } from '../api/types';

interface RoundRobinViewProps {
  tournament: Tournament;
  getTeamName: (id: string | null) => string;
  onMatchClick: (match: Match) => void;
}

export function RoundRobinView({ tournament, getTeamName, onMatchClick }: RoundRobinViewProps) {
  // Group matches by round
  const rounds = new Map<number, Match[]>();
  tournament.matches.forEach((m) => {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round)!.push(m);
  });

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);

  // Calculate standings
  const standings = tournament.teams.map((team) => {
    const wins = tournament.matches.filter(
      (m) => m.status === 'completed' && m.winnerId === team.id
    ).length;
    const losses = tournament.matches.filter(
      (m) => m.status === 'completed' && m.loserId === team.id
    ).length;
    const pointsFor = tournament.matches
      .filter((m) => m.status === 'completed')
      .reduce((sum, m) => {
        if (m.team1Id === team.id) return sum + (m.team1Score || 0);
        if (m.team2Id === team.id) return sum + (m.team2Score || 0);
        return sum;
      }, 0);
    const pointsAgainst = tournament.matches
      .filter((m) => m.status === 'completed')
      .reduce((sum, m) => {
        if (m.team1Id === team.id) return sum + (m.team2Score || 0);
        if (m.team2Id === team.id) return sum + (m.team1Score || 0);
        return sum;
      }, 0);

    return { team, wins, losses, pointsFor, pointsAgainst };
  });

  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst);
  });

  return (
    <div className="space-y-8">
      {/* Standings */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Standings</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-sm">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">PF</th>
                <th className="px-4 py-3 text-center">PA</th>
                <th className="px-4 py-3 text-center">+/-</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team.id} className="border-b border-gray-700/50">
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{s.team.name}</td>
                  <td className="px-4 py-3 text-center text-green-400">{s.wins}</td>
                  <td className="px-4 py-3 text-center text-red-400">{s.losses}</td>
                  <td className="px-4 py-3 text-center">{s.pointsFor}</td>
                  <td className="px-4 py-3 text-center">{s.pointsAgainst}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={
                        s.pointsFor - s.pointsAgainst > 0
                          ? 'text-green-400'
                          : s.pointsFor - s.pointsAgainst < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }
                    >
                      {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}
                      {s.pointsFor - s.pointsAgainst}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matches by round */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Matches</h2>
        <div className="space-y-6">
          {sortedRounds.map(([round, matches]) => (
            <div key={round}>
              <h3 className="text-sm text-gray-400 mb-3">Round {round}</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {matches
                  .sort((a, b) => a.position - b.position)
                  .map((match) => {
                    const isClickable =
                      match.status !== 'completed' &&
                      match.team1Id &&
                      match.team2Id;
                    const isComplete = match.status === 'completed';

                    return (
                      <div
                        key={match.id}
                        onClick={isClickable ? () => onMatchClick(match) : undefined}
                        className={`bg-gray-800 border rounded-lg p-4 ${
                          isClickable
                            ? 'border-blue-500 cursor-pointer hover:border-blue-400'
                            : isComplete
                            ? 'border-green-800'
                            : 'border-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span
                            className={`font-medium ${
                              isComplete && match.winnerId === match.team1Id
                                ? 'text-green-400'
                                : ''
                            }`}
                          >
                            {getTeamName(match.team1Id)}
                          </span>
                          {match.team1Score !== null && (
                            <span className="font-bold text-lg">
                              {match.team1Score}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs mb-2">vs</div>
                        <div className="flex justify-between items-center">
                          <span
                            className={`font-medium ${
                              isComplete && match.winnerId === match.team2Id
                                ? 'text-green-400'
                                : ''
                            }`}
                          >
                            {getTeamName(match.team2Id)}
                          </span>
                          {match.team2Score !== null && (
                            <span className="font-bold text-lg">
                              {match.team2Score}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
