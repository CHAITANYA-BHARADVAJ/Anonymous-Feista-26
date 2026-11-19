import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { formatMs } from '../../hooks/useCountdown';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { disconnectSocket } from '../../lib/socket';

export default function Profile() {
  const teamName = useAuthStore((s) => s.teamName);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const progress = useGameStore((s) => s.progress);

  const totalHints = progress.reduce((s, p) => s + p.hintsUsed, 0);
  const levelsComplete = progress.filter((p) => p.completedAt).length;

  async function logout() {
    await api.logout().catch(() => {});
    clear();
    disconnectSocket();
    navigate('/login');
  }

  return (
    <div className="flex flex-col px-6 py-8 gap-6 pb-24">
      <div className="text-center">
        <div className="text-5xl mb-3">👤</div>
        <h2 className="text-2xl font-bold">{teamName}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-brand-400">{levelsComplete}</p>
          <p className="text-xs text-gray-500 mt-1">Levels Complete</p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{totalHints}</p>
          <p className="text-xs text-gray-500 mt-1">Hints Used</p>
        </div>
      </div>

      <button
        onClick={logout}
        className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold text-base min-h-[44px] mt-4"
      >
        Sign Out
      </button>
    </div>
  );
}
