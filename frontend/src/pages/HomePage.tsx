import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AnyTournament } from '../api/types';
import { isMultiStage } from '../api/types';

export function HomePage() {
  const [tournaments, setTournaments] = useState<AnyTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const formatLabel = (format: string) =>
    format.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Tournaments</h1>
        <Link
          to="/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          + New Tournament
        </Link>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && tournaments.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-4">No tournaments yet</p>
          <Link to="/create" className="text-blue-400 hover:underline">
            Create your first tournament
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => {
          const multi = isMultiStage(t);
          const currentStage = multi
            ? t.stages.find((s) => s.id === t.currentStageId)
            : null;

          return (
            <Link
              key={t.id}
              to={`/tournament/${t.id}`}
              className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-blue-500 transition-colors"
            >
              <h3 className="text-lg font-semibold mb-2">{t.name}</h3>
              <div className="flex gap-2 mb-3 flex-wrap">
                <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
                  {t.sport}
                </span>
                {multi ? (
                  <>
                    <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-sm">
                      Multi-Stage
                    </span>
                    {currentStage && (
                      <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
                        {currentStage.name}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
                    {formatLabel(t.format)}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>{t.teams.length} teams</span>
                <span
                  className={
                    t.status === 'completed'
                      ? 'text-green-400'
                      : t.status === 'in_progress'
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }
                >
                  {formatLabel(t.status)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
