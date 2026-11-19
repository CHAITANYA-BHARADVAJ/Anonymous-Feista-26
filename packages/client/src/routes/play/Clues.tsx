import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function Clues() {
  const game = useGameStore((s) => s.game);
  const currentLevel = useGameStore((s) => s.currentLevel)();
  const setProgress = useGameStore((s) => s.setProgress);
  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState('');
  const [answerLoading, setAnswerLoading] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [hintLoading, setHintLoading] = useState<number | null>(null);
  const navigate = useNavigate();

  if (!currentLevel) {
    return <div className="p-6 text-center text-gray-400">No active level.</div>;
  }

  const level = currentLevel.level;
  const isCompleted = !!currentLevel.completedAt;
  const revealedHintIds = new Set(currentLevel.hintReveals.map((r) => r.hintId));

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    setAnswerError('');
    setAnswerLoading(true);
    try {
      const res = await api.submitAnswer(level.id, answer);
      if (res.correct) {
        const data = await api.getParticipantGame();
        setProgress(data.progress);
        if (res.nextLevelId) navigate('../home');
      }
    } catch (err: any) {
      setAnswerError(err.message ?? 'Incorrect answer');
      if ('vibrate' in navigator) navigator.vibrate(200);
    } finally {
      setAnswerLoading(false);
    }
  }

  async function useHint(hint: { id: number; orderIndex: number; penaltyMins: number }) {
    if (revealedHintIds.has(hint.id)) return;
    const freeHint = currentLevel.hintsUsed < (currentLevel.hintReveals.length - revealedHintIds.size + 1);
    const penalty = freeHint ? 0 : hint.penaltyMins;
    const msg = penalty > 0
      ? `This hint adds +${penalty} minutes to your total time. Reveal it?`
      : 'Use a free hint?';
    if (!confirm(msg)) return;

    setHintLoading(hint.orderIndex);
    try {
      const res = await api.revealHint(level.id, hint.orderIndex);
      setRevealedHints((prev) => ({ ...prev, [hint.id]: res.text }));
      const data = await api.getParticipantGame();
      setProgress(data.progress);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setHintLoading(null);
    }
  }

  return (
    <div className="flex flex-col px-6 py-8 gap-6 pb-24">
      {/* Level header */}
      <div>
        <span className="text-xs text-gray-500 uppercase tracking-wider">Level {level.orderIndex}</span>
        <h2 className="text-2xl font-bold mt-1">{level.title}</h2>
      </div>

      {/* Clue */}
      <div className="bg-gray-800 rounded-2xl p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">🔍 Clue</p>
        <p className="text-base leading-relaxed">{level.clueText}</p>
      </div>

      {/* Location hint */}
      <div className="bg-gray-800 rounded-2xl p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">📍 Location Hint</p>
        <p className="text-base">{level.locationHint}</p>
      </div>

      {/* Social links */}
      {level.socialLinks.length > 0 && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">🔗 Social Profiles</p>
          <div className="flex flex-wrap gap-2">
            {level.socialLinks.map((sl, i) => (
              <a
                key={i}
                href={sl.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-brand-900 text-brand-400 text-sm font-medium min-h-[44px] flex items-center"
              >
                {sl.platform.charAt(0).toUpperCase() + sl.platform.slice(1)} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Hints */}
      {!isCompleted && level.hints.length > 0 && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            💡 Hints ({currentLevel.hintsUsed}/3 used)
          </p>
          <div className="space-y-2">
            {level.hints.map((hint) => {
              const revealed = revealedHintIds.has(hint.id) || revealedHints[hint.id];
              const text = revealedHints[hint.id];
              return (
                <div key={hint.id} className="bg-gray-900 rounded-xl p-4">
                  {revealed && text ? (
                    <p className="text-sm">{text}</p>
                  ) : revealed ? (
                    <p className="text-sm text-gray-400 italic">Hint already used (refresh to see)</p>
                  ) : (
                    <button
                      onClick={() => useHint(hint)}
                      disabled={hintLoading === hint.orderIndex || currentLevel.hintsUsed >= 3}
                      className="w-full text-left text-sm text-yellow-400 font-medium min-h-[44px] flex items-center gap-2"
                    >
                      {hintLoading === hint.orderIndex ? '…' : `Hint ${hint.orderIndex} (+${hint.penaltyMins} min)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Answer / final level */}
      {level.isFinal ? (
        <button
          onClick={() => navigate('../camera')}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-lg min-h-[44px]"
        >
          📸 Take Final Photo
        </button>
      ) : !isCompleted ? (
        <form onSubmit={submitAnswer} className="flex flex-col gap-3">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer…"
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white text-base focus:outline-none focus:border-brand-400"
          />
          {answerError && <p className="text-red-400 text-sm">{answerError}</p>}
          <button
            type="submit"
            disabled={answerLoading || !answer.trim()}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-base min-h-[44px]"
          >
            {answerLoading ? 'Checking…' : 'Submit Answer'}
          </button>
        </form>
      ) : (
        <div className="text-center text-green-400 font-semibold py-4">✅ Level complete!</div>
      )}
    </div>
  );
}
