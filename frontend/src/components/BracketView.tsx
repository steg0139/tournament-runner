import type { Tournament, Match } from '../api/types';

interface BracketViewProps {
  tournament: Tournament;
  getTeamName: (id: string | null) => string;
  onMatchClick: (match: Match) => void;
}

export function BracketView({ tournament, getTeamName, onMatchClick }: BracketViewProps) {
  const winnersMatches = tournament.matches.filter((m) => m.bracket === 'winners');
  const losersMatches = tournament.matches.filter((m) => m.bracket === 'losers');
  const finalsMatches = tournament.matches.filter((m) => m.bracket === 'finals');

  const rounds = new Map<number, Match[]>();
  winnersMatches.forEach((m) => {
    if (!rounds.has(m.round)) rounds.set(m.round, []);
    rounds.get(m.round)!.push(m);
  });

  const sortedRounds = Array.from(rounds.entries()).sort(([a], [b]) => a - b);

  return (
    <div className="space-y-8">
      {/* Winners Bracket */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          {tournament.format === 'double_elimination' ? 'Winners Bracket' : 'Bracket'}
        </h2>
        <div className="flex gap-8 overflow-x-auto pb-4">
          {sortedRounds.map(([round, matches]) => (
            <div key={round} className="flex-shrink-0">
              <h3 className="text-sm text-gray-400 mb-3 text-center">
                {round === sortedRounds.length
                  ? 'Final'
                  : round === sortedRounds.length - 1
                  ? 'Semifinal'
                  : `Round ${round}`}
              </h3>
              <div className="flex flex-col justify-around h-full gap-4">
                {matches
                  .sort((a, b) => a.position - b.position)
                  .map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      getTeamName={getTeamName}
                      onClick={() => onMatchClick(match)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Losers Bracket */}
      {losersMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Losers Bracket</h2>
          <div className="flex gap-8 overflow-x-auto pb-4">
            {(() => {
              const losersRounds = new Map<number, Match[]>();
              losersMatches.forEach((m) => {
                if (!losersRounds.has(m.round)) losersRounds.set(m.round, []);
                losersRounds.get(m.round)!.push(m);
              });
              return Array.from(losersRounds.entries())
                .sort(([a], [b]) => a - b)
                .map(([round, matches]) => (
                  <div key={round} className="flex-shrink-0">
                    <h3 className="text-sm text-gray-400 mb-3 text-center">
                      Losers R{round - sortedRounds.length}
                    </h3>
                    <div className="flex flex-col justify-around h-full gap-4">
                      {matches
                        .sort((a, b) => a.position - b.position)
                        .map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            getTeamName={getTeamName}
                            onClick={() => onMatchClick(match)}
                          />
                        ))}
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>
      )}

      {/* Grand Finals */}
      {finalsMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Grand Finals</h2>
          <div className="flex gap-4">
            {finalsMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                getTeamName={getTeamName}
                onClick={() => onMatchClick(match)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  getTeamName,
  onClick,
}: {
  match: Match;
  getTeamName: (id: string | null) => string;
  onClick: () => void;
}) {
  const isClickable =
    match.status !== 'completed' && match.team1Id && match.team2Id;
  const isComplete = match.status === 'completed';

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`w-56 border rounded-lg overflow-hidden ${
        isClickable
          ? 'border-blue-500 cursor-pointer hover:border-blue-400'
          : isComplete
          ? 'border-green-800'
          : 'border-gray-700'
      }`}
    >
      <div
        className={`flex justify-between items-center px-3 py-2 ${
          isComplete && match.winnerId === match.team1Id
            ? 'bg-green-900/30'
            : 'bg-gray-800'
        }`}
      >
        <span className="text-sm truncate max-w-[140px]">
          {getTeamName(match.team1Id)}
        </span>
        {match.team1Score !== null && (
          <span className="text-sm font-bold">{match.team1Score}</span>
        )}
      </div>
      <div className="border-t border-gray-700" />
      <div
        className={`flex justify-between items-center px-3 py-2 ${
          isComplete && match.winnerId === match.team2Id
            ? 'bg-green-900/30'
            : 'bg-gray-800'
        }`}
      >
        <span className="text-sm truncate max-w-[140px]">
          {getTeamName(match.team2Id)}
        </span>
        {match.team2Score !== null && (
          <span className="text-sm font-bold">{match.team2Score}</span>
        )}
      </div>
    </div>
  );
}
