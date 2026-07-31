import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Sport, TournamentFormat } from '../api/types';

export function CreateTournamentPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<Sport>('basketball');
  const [format, setFormat] = useState<TournamentFormat>('single_elimination');
  const [teamInput, setTeamInput] = useState('');
  const [teams, setTeams] = useState<{ name: string; seed?: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addTeam = () => {
    const trimmed = teamInput.trim();
    if (!trimmed) return;
    if (teams.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Team already added');
      return;
    }
    setTeams([...teams, { name: trimmed, seed: teams.length + 1 }]);
    setTeamInput('');
    setError(null);
  };

  const removeTeam = (index: number) => {
    const updated = teams.filter((_, i) => i !== index);
    // Re-seed
    setTeams(updated.map((t, i) => ({ ...t, seed: i + 1 })));
  };

  const moveTeam = (index: number, direction: 'up' | 'down') => {
    const newTeams = [...teams];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newTeams.length) return;
    [newTeams[index], newTeams[swapIndex]] = [newTeams[swapIndex], newTeams[index]];
    setTeams(newTeams.map((t, i) => ({ ...t, seed: i + 1 })));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Tournament name is required');
      return;
    }
    if (teams.length < 2) {
      setError('Need at least 2 teams');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const tournament = await api.createTournament({
        name: name.trim(),
        sport,
        format,
        teams,
      });
      navigate(`/tournament/${tournament.id}`);
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const handleBulkAdd = () => {
    const lines = teamInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    
    if (lines.length > 1) {
      const newTeams = lines
        .filter((l) => !teams.some((t) => t.name.toLowerCase() === l.toLowerCase()))
        .map((name, i) => ({ name, seed: teams.length + i + 1 }));
      setTeams([...teams, ...newTeams]);
      setTeamInput('');
      setError(null);
    } else {
      addTeam();
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create Tournament</h1>

      <div className="space-y-6">
        {/* Tournament Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tournament Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Cornhole Classic 2024"
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Sport */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Sport
          </label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value as Sport)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="basketball">🏀 Basketball</option>
            <option value="cornhole">🌽 Cornhole</option>
            <option value="other">🎯 Other</option>
          </select>
        </div>

        {/* Format */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tournament Format
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'single_elimination', label: 'Single Elimination', desc: 'Lose once, you\'re out' },
              { value: 'double_elimination', label: 'Double Elimination', desc: 'Lose twice to be eliminated' },
              { value: 'round_robin', label: 'Round Robin', desc: 'Everyone plays everyone' },
              { value: 'swiss', label: 'Swiss', desc: 'Paired by record each round' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value as TournamentFormat)}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  format === f.value
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-sm text-gray-400 mt-1">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Teams */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Teams / Players ({teams.length} added)
          </label>
          <div className="flex gap-2">
            <textarea
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleBulkAdd();
                }
              }}
              placeholder="Enter team name (or paste multiple names, one per line)"
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleBulkAdd}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Tip: Paste multiple names separated by new lines to bulk add. Order determines seeding (top = #1 seed).
          </p>

          {teams.length > 0 && (
            <div className="mt-4 space-y-2">
              {teams.map((team, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2"
                >
                  <span className="text-gray-500 text-sm w-6">#{team.seed}</span>
                  <span className="flex-1">{team.name}</span>
                  <button
                    onClick={() => moveTeam(i, 'up')}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveTeam(i, 'down')}
                    disabled={i === teams.length - 1}
                    className="text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeTeam(i)}
                    className="text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-4 rounded-lg font-medium text-lg transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </div>
  );
}
