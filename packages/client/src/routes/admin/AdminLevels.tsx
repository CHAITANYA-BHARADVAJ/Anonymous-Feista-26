import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function AdminLevels() {
  const [levels, setLevels] = useState<any[]>([]);
  const [gameId, setGameId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.getGames().then((games) => {
      if (games[0]) {
        setGameId(games[0].id);
        return api.request ? undefined : fetch(`/api/v1/levels/game/${games[0].id}`, { credentials: 'include' })
          .then((r) => r.json()).then(setLevels);
      }
    });
  }, []);

  // Use the api helper directly
  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/v1/levels/game/${gameId}`, { credentials: 'include' })
      .then((r) => r.json()).then(setLevels);
  }, [gameId]);

  return (
    <div className="p-4 flex flex-col gap-4 pb-10">
      <h2 className="text-lg font-bold">Levels</h2>
      {levels.length === 0 && <p className="text-gray-500 text-sm">No levels configured yet.</p>}
      {levels.map((level) => (
        <div key={level.id} className="bg-gray-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === level.id ? null : level.id)}
            className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[56px]"
          >
            <div>
              <span className="text-xs text-gray-500 uppercase">Level {level.orderIndex}</span>
              <p className="font-semibold">{level.title}</p>
            </div>
            <span className="text-gray-500">{expanded === level.id ? '▲' : '▼'}</span>
          </button>

          {expanded === level.id && (
            <div className="px-5 pb-5 space-y-3 border-t border-gray-700">
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Clue</p>
                <p className="text-sm">{level.clueText}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Location Hint</p>
                <p className="text-sm">{level.locationHint}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Answer</p>
                <p className="text-sm font-mono bg-gray-900 px-3 py-1 rounded-lg inline-block">{level.answer || '(final level)'}</p>
              </div>
              {level.durationSecs && (
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Timer</p>
                  <p className="text-sm">{Math.floor(level.durationSecs / 60)} minutes</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Hints ({level.hints?.length ?? 0})</p>
                {level.hints?.map((h: any) => (
                  <p key={h.id} className="text-xs text-gray-400">
                    #{h.orderIndex}: {h.text} <span className="text-yellow-500">(+{h.penaltyMins} min)</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Social Links</p>
                {level.socialLinks?.map((sl: any) => (
                  <p key={sl.id} className="text-xs">
                    <span className="text-gray-400">{sl.platform}:</span>{' '}
                    <a href={sl.url} target="_blank" rel="noreferrer" className="text-brand-400 underline">{sl.url}</a>
                  </p>
                ))}
              </div>
              {level.isFinal && (
                <span className="inline-block text-xs bg-green-900 text-green-400 px-3 py-1 rounded-full">Final Level</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
