import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { disconnectSocket } from '../../lib/socket';
import { toggleFullscreen, enableAutoFullscreenOnFirstGesture } from '../../lib/fullscreen';

const NAV = [
  { to: 'game', label: '🎮 Live Operations' },
  { to: 'teams', label: '👥 Teams & Registration' },
  { to: 'levels', label: '🗺 Map & Clues Builder' },
];

export default function AdminLayout() {
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    return cleanup;
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    clear();
    disconnectSocket();
    navigate('/admin/login');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Anonymous SDMCET" className="w-7 h-7 object-contain rounded-lg border border-white/10" />
          <h1 className="text-lg font-bold text-brand-400">Campus Hunt Admin</h1>
          <span className="hidden sm:inline-block text-[11px] font-mono text-gray-400 border-l border-gray-800 pl-3">
            Designed and developed by Anonymous_SDMCET
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFullscreen()}
            className="text-xs font-mono text-gray-400 hover:text-amber-300 px-2.5 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-950/50 flex items-center gap-1.5"
            title="Toggle Fullscreen"
          >
            <span>⛶</span>
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded-lg min-h-[44px]">
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="flex border-b border-gray-800 bg-gray-900">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center ${
                isActive ? 'text-brand-400 border-b-2 border-brand-400' : 'text-gray-500'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
