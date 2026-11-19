import { useGameStore } from '../../stores/gameStore';
import { formatMs } from '../../hooks/useCountdown';

export default function Leaderboard() {
  const rankings = useGameStore((s) => s.rankings);
  const teamId = useGameStore((s) => s.game);

  return (
    <div className="flex flex-col px-4 py-6 gap-4 pb-24">
      <h2 className="text-xl font-bold text-center">🏆 Leaderboard</h2>

      {rankings.length === 0 ? (
        <p className="text-center text-gray-500">No standings yet.</p>
      ) : (
        <div className="bg-gray-800 rounded-2xl overflow-hidden">
          {rankings.map((r, i) => (
            <div
              key={r.teamId}
              className={`flex items-center gap-4 px-4 py-4 border-b border-gray-700 last:border-0 ${
                i === 0 ? 'bg-yellow-900/20' : ''
              }`}
            >
              <span className="text-2xl w-8 text-center">
                {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
              </span>
              <div className="flex-1">
                <p className="font-semibold">{r.teamName}</p>
                <p className="text-xs text-gray-500">Level {r.currentLevel}</p>
              </div>
              <div className="text-right">
                {r.finished && r.adjustedTimeSecs != null ? (
                  <p className="font-mono text-green-400 font-semibold">{formatMs(r.adjustedTimeSecs * 1000)}</p>
                ) : (
                  <p className="text-gray-500 text-sm">In progress</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
