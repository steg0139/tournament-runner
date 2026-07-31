import { useState } from 'react';
import type { Match } from '../api/types';

interface ScoreModalProps {
  match: Match;
  team1Name: string;
  team2Name: string;
  onSubmit: (team1Score: number, team2Score: number) => void;
  onClose: () => void;
}

export function ScoreModal({ match, team1Name, team2Name, onSubmit, onClose }: ScoreModalProps) {
  const [team1Score, setTeam1Score] = useState<string>(
    match.team1Score?.toString() || ''
  );
  const [team2Score, setTeam2Score] = useState<string>(
    match.team2Score?.toString() || ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const s1 = parseInt(team1Score, 10);
    const s2 = parseInt(team2Score, 10);

    if (isNaN(s1) || isNaN(s2)) {
      setError('Please enter valid scores');
      return;
    }

    if (s1 < 0 || s2 < 0) {
      setError('Scores cannot be negative');
      return;
    }

    if (s1 === s2) {
      setError('Ties are not allowed — someone has to win!');
      return;
    }

    onSubmit(s1, s2);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-12 sm:items-center sm:pt-0 p-4">
      <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 sm:p-6 w-full max-w-xs sm:max-w-sm">
        {/* Team 1 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="flex-1 text-sm font-medium truncate">{team1Name}</span>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="0"
            value={team1Score}
            onChange={(e) => setTeam1Score(e.target.value)}
            className="w-16 h-11 bg-gray-700 border border-gray-600 rounded-lg text-center text-xl font-bold text-white focus:border-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Team 2 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="flex-1 text-sm font-medium truncate">{team2Name}</span>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="0"
            value={team2Score}
            onChange={(e) => setTeam2Score(e.target.value)}
            className="w-16 h-11 bg-gray-700 border border-gray-600 rounded-lg text-center text-xl font-bold text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
