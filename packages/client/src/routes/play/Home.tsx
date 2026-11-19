import { useGameStore } from '../../stores/gameStore';
import { useCountdown, formatMs } from '../../hooks/useCountdown';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();

  const levelDeadlineMs = currentLevel?.level.durationSecs && currentLevel.unlockedAt && game?.status === 'running'
    ? new Date(currentLevel.unlockedAt).getTime() + currentLevel.level.durationSecs * 1000 + (game?.totalPausedMs ?? 0)
    : null;

  const levelRemaining = useCountdown(levelDeadlineMs, game?.pausedAt ? new Date(game.pausedAt).getTime() : null);
  const navigate = useNavigate();

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
        <div className="text-6xl mb-4">🎯</div>
        <h1 className="text-2xl font-bold text-brand-400 mb-2">Campus Hunt</h1>
        <p className="text-gray-400">Waiting for the game to start…</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    idle: 'text-gray-400',
    running: 'text-green-400',
    paused: 'text-yellow-400',
    ended: 'text-red-400',
  };

  return (
    <div className="flex flex-col px-6 py-8 gap-6">
      {/* Game status */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand-400">{game.name}</h1>
        <span className={`text-sm font-semibold uppercase tracking-widest ${statusColors[game.status]}`}>
          {game.status}
        </span>
      </div>

      {/* Current level card */}
      {currentLevel ? (
        <div className="bg-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Current Level</span>
            <span className="text-xs bg-brand-900 text-brand-400 px-2 py-0.5 rounded-full">
              Level {currentLevel.level.orderIndex}
            </span>
          </div>
          <h2 className="text-xl font-bold">{currentLevel.level.title}</h2>

          {/* Per-level countdown */}
          {currentLevel.level.durationSecs && !currentLevel.completedAt && (
            <div className="bg-gray-900 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Level timer</p>
              <p className={`text-4xl font-mono font-bold ${levelRemaining < 60000 ? 'text-red-400' : 'text-white'}`}>
                {formatMs(levelRemaining)}
              </p>
            </div>
          )}

          {currentLevel.completedAt && (
            <div className="bg-green-900/40 border border-green-700 rounded-xl p-3 text-center text-green-400 text-sm font-semibold">
              ✅ Level complete
            </div>
          )}

          <button
            onClick={() => navigate('../clues')}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-800 text-white font-semibold transition-all min-h-[44px]"
          >
            View Clues →
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-400">
          {game.status === 'idle' ? 'Game hasn\'t started yet.' : 'All levels complete!'}
        </div>
      )}

      {/* Paused notice */}
      {game.status === 'paused' && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-4 text-center text-yellow-300 font-medium">
          ⏸ Game is paused — timers are frozen
        </div>
      )}

      {game.status === 'ended' && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-center text-red-300 font-medium">
          🏁 Game over! Check the leaderboard for final standings.
        </div>
      )}
    </div>
  );
}
