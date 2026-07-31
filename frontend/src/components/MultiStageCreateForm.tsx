import type { TournamentFormat } from '../api/types';

export interface StageConfig {
  name: string;
  format: TournamentFormat;
  groupCount: number;
  eliminationThreshold?: number;
  advancementCount?: number;
  winsToAdvance?: number;
  courts?: number;
}

interface MultiStageCreateFormProps {
  stages: StageConfig[];
  onChange: (stages: StageConfig[]) => void;
}

export function MultiStageCreateForm({ stages, onChange }: MultiStageCreateFormProps) {
  const addStage = () => {
    const position = stages.length + 1;
    onChange([
      ...stages,
      {
        name: position === 1 ? 'Group Stage' : `Stage ${position}`,
        format: position === 1 ? 'swiss' : 'single_elimination',
        groupCount: position === 1 ? 2 : 1,
        eliminationThreshold: position === 1 ? 2 : undefined,
        advancementCount: 2,
      },
    ]);
  };

  const removeStage = (index: number) => {
    if (stages.length <= 2) return;
    onChange(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, updates: Partial<StageConfig>) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], ...updates };

    // Clear elimination threshold if not Swiss
    if (updates.format && updates.format !== 'swiss') {
      newStages[index].eliminationThreshold = undefined;
      newStages[index].winsToAdvance = undefined;
      newStages[index].courts = undefined;
    }
    // Set default elimination threshold if switching to Swiss
    if (updates.format === 'swiss' && !newStages[index].eliminationThreshold) {
      newStages[index].eliminationThreshold = 2;
    }

    onChange(newStages);
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const newStages = [...stages];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newStages.length) return;
    [newStages[index], newStages[swapIndex]] = [newStages[swapIndex], newStages[index]];
    onChange(newStages);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-gray-300">
          Stages ({stages.length})
        </label>
        {stages.length < 10 && (
          <button
            onClick={addStage}
            className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors"
          >
            + Add Stage
          </button>
        )}
      </div>

      {stages.map((stage, index) => {
        const isFinal = index === stages.length - 1;
        const isFirst = index === 0;

        return (
          <div
            key={index}
            className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                  Stage {index + 1}{isFinal ? ' (Final)' : ''}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveStage(index, 'up')}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-white disabled:opacity-30 text-xs"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStage(index, 'down')}
                    disabled={isFinal}
                    className="text-gray-400 hover:text-white disabled:opacity-30 text-xs"
                  >
                    ↓
                  </button>
                </div>
              </div>
              {stages.length > 2 && (
                <button
                  onClick={() => removeStage(index)}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Stage Name */}
            <input
              type="text"
              value={stage.name}
              onChange={(e) => updateStage(index, { name: e.target.value })}
              placeholder="Stage name"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />

            {/* Format */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Format</label>
                <select
                  value={stage.format}
                  onChange={(e) => updateStage(index, { format: e.target.value as TournamentFormat })}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="swiss">Swiss</option>
                  <option value="single_elimination">Single Elimination</option>
                  <option value="double_elimination">Double Elimination</option>
                  <option value="round_robin">Round Robin</option>
                </select>
              </div>

              {/* Group Count (first stage) */}
              {isFirst && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Groups</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="16"
                    value={stage.groupCount === 0 ? '' : stage.groupCount}
                    onChange={(e) => updateStage(index, { groupCount: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Elimination Threshold (Swiss only) */}
              {stage.format === 'swiss' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Losses to eliminate</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="5"
                    value={stage.eliminationThreshold ?? ''}
                    onChange={(e) => updateStage(index, { eliminationThreshold: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Advancement Count (non-final) */}
              {!isFinal && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">
                    Teams advancing{isFirst && stage.groupCount > 1 ? ' (per group)' : ''}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="32"
                    value={stage.advancementCount ?? ''}
                    onChange={(e) => updateStage(index, { advancementCount: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Leave empty = advance all who qualify. Set to e.g. 8 to cap and fill by tiebreaker.</p>
                </div>
              )}

              {/* Wins to Advance (Swiss non-final) */}
              {!isFinal && stage.format === 'swiss' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Wins to advance</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="20"
                    value={stage.winsToAdvance ?? ''}
                    onChange={(e) => updateStage(index, { winsToAdvance: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Leave empty = advance top N. Set to e.g. 3 to auto-advance at 3 wins.</p>
                </div>
              )}

              {/* Courts/Boards available */}
              {stage.format === 'swiss' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Courts / Boards</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="50"
                    value={stage.courts ?? ''}
                    onChange={(e) => updateStage(index, { courts: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Next round matchups appear when fewer games remain than this. Leave empty = wait for full round.</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
