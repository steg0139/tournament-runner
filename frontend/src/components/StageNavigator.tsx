import type { Stage } from '../api/types';

interface StageNavigatorProps {
  stages: Stage[];
  currentStageId: string;
  selectedStageId: string;
  onSelectStage: (stageId: string) => void;
}

export function StageNavigator({
  stages,
  currentStageId,
  selectedStageId,
  onSelectStage,
}: StageNavigatorProps) {
  const formatLabel = (format: string) =>
    format.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
      {stages
        .sort((a, b) => a.position - b.position)
        .map((stage) => {
          const isActive = stage.id === currentStageId;
          const isSelected = stage.id === selectedStageId;
          const isPending = stage.status === 'pending';
          const isCompleted = stage.status === 'completed';

          return (
            <button
              key={stage.id}
              onClick={() => !isPending && onSelectStage(stage.id)}
              disabled={isPending}
              className={`flex-shrink-0 px-4 py-3 rounded-lg border transition-colors text-left ${
                isSelected
                  ? 'border-blue-500 bg-blue-900/30'
                  : isPending
                  ? 'border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-500 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{stage.name}</span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">
                  {formatLabel(stage.format)}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    isCompleted
                      ? 'bg-green-900/50 text-green-400'
                      : isActive
                      ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {isCompleted ? '✓' : isActive ? 'Live' : 'Pending'}
                </span>
              </div>
            </button>
          );
        })}
    </div>
  );
}
