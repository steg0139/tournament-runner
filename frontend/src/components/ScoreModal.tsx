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
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-800 border-t sm:border border-gray-600 sm:rounded-xl rounded-t-xl p-5 sm:p-6 w-full sm:max-w-sm">
        <h2 className="text-lg font-bold mb-5 text-center">Enter Score</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex-1 text-right font-medium text-sm truncate">{team1Name}</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={team1Score}
              onChange={(e) => setTeam1Score(e.target.value)}
              className="w-20 h-12 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-center text-xl font-bold text-white focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="text-center text-gray-500 text-xs">vs</div>

          <div className="flex items-center gap-3">
            <label className="flex-1 text-right font-medium text-sm truncate">{team2Name}</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              value={team2Score}
              onChange={(e) => setTeam2Score(e.target.value)}
              className="w-20 h-12 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-center text-xl font-bold text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mt-4 text-center">{error}</p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white px-4 py-3.5 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-3.5 rounded-lg font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
