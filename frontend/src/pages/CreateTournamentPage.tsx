import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Sport, TournamentFormat } from '../api/types';
import { MultiStageCreateForm } from '../components/MultiStageCreateForm';
import type { StageConfig } from '../components/MultiStageCreateForm';

type TournamentStructure = 'single' | 'multi_stage';

export function CreateTournamentPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<Sport>('basketball');
  const [structure, setStructure] = useState<TournamentStructure>('single');
  const [format, setFormat] = useState<TournamentFormat>('single_elimination');
  const [teamInput, setTeamInput] = useState('');
  const [teams, setTeams] = useState<{ name: string; seed?: number }[]>([]);
  const [stages, setStages] = useState<StageConfig[]>([
    { name: 'Group Stage', format: 'swiss', groupCount: 2, eliminationThreshold: 2, advancementCount: 2 },
    { name: 'Playoffs', format: 'single_elimination', groupCount: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const removeTeam = (index: number) => {
    const updated = teams.filter((_, i) => i !== index);
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

    setSubmitting(true);
    setError(null);

    try {
      if (structure === 'multi_stage') {
        const tournament = await api.createMultiStageTournament({
          name: name.trim(),
          sport,
          teams: teams.length > 0 ? teams : [],
          stages,
        });
        navigate(`/tournament/${tournament.id}`);
      } else {
        const tournament = await api.createTournament({
          name: name.trim(),
          sport,
          format,
          teams: teams.length > 0 ? teams : [],
        });
        navigate(`/tournament/${tournament.id}`);
      }
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const handleBulkAdd = () => {
    const names = teamInput
      .split(/[,\n]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (names.length === 0) return;

    const newTeams = names
      .filter((l) => !teams.some((t) => t.name.toLowerCase() === l.toLowerCase()))
      .map((name, i) => ({ name, seed: teams.length + i + 1 }));

    if (newTeams.length > 0) {
      setTeams([...teams, ...newTeams]);
    }
    setTeamInput('');
    setError(null);
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

        {/* Tournament Structure Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tournament Structure
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStructure('single')}
              className={`p-4 rounded-lg border text-left transition-colors ${
                structure === 'single'
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Single Format</div>
              <div className="text-sm text-gray-400 mt-1">One format for the whole tournament</div>
            </button>
            <button
              onClick={() => setStructure('multi_stage')}
              className={`p-4 rounded-lg border text-left transition-colors ${
                structure === 'multi_stage'
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className="font-medium">Multi-Stage</div>
              <div className="text-sm text-gray-400 mt-1">Groups → Playoffs (or custom stages)</div>
            </button>
          </div>
        </div>

        {/* Single Format Picker */}
        {structure === 'single' && (
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
        )}

        {/* Multi-Stage Configuration */}
        {structure === 'multi_stage' && (
          <MultiStageCreateForm stages={stages} onChange={setStages} />
        )}

        {/* Teams */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Teams / Players ({teams.length} added)
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
              onClick={handleBulkAdd}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors h-fit"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Separate names with commas or new lines. Order determines seeding (first added = #1 seed).
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
