import { Outlet, NavLink } from 'react-router-dom';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import ZoneWarning from '../../components/ZoneWarning';
import AnnouncementBanner from '../../components/AnnouncementBanner';
import { useNavigate } from 'react-router-dom';

const NAV = [
  { to: 'home', icon: '🏠', label: 'Home' },
  { to: 'clues', icon: '🔍', label: 'Clues' },
  { to: 'map', icon: '🗺', label: 'Map' },
  { to: 'leaderboard', icon: '🏆', label: 'Board' },
  { to: 'profile', icon: '👤', label: 'Profile' },
];

export default function PlayLayout() {
  const connected = useGameStore((s) => s.connected);
  const game = useGameStore((s) => s.game);
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);

  async function handleSOS() {
    if (!confirm('Send SOS alert to admin? This will share your location.')) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await api.sendSOS(pos.coords.latitude, pos.coords.longitude);
      alert('SOS sent! Admin has been notified.');
    });
  }

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto">
      {/* Reconnecting banner */}
      {!connected && (
        <div className="bg-yellow-700 text-center text-sm py-1 px-4">
          🔄 Reconnecting…
        </div>
      )}

      <AnnouncementBanner />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>

      {/* SOS button — fixed above bottom nav */}
      {game?.status === 'running' && (
        <button
          onClick={handleSOS}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-red-600 text-white text-sm font-bold shadow-lg flex items-center justify-center active:scale-95"
        >
          SOS
        </button>
      )}

      {/* Bottom nav */}
      <nav className="flex border-t border-gray-800 bg-gray-900 safe-bottom">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] text-xs transition-colors ${
                isActive ? 'text-brand-400' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <ZoneWarning />
    </div>
  );
}
