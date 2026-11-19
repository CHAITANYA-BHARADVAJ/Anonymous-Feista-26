import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { disconnectSocket } from '../../lib/socket';

const NAV = [
  { to: 'game', label: '🎮 Game' },
  { to: 'levels', label: '📋 Levels' },
  { to: 'photos', label: '📸 Photos' },
];

export default function AdminLayout() {
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

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
        <h1 className="text-lg font-bold text-brand-400">🎯 Campus Hunt Admin</h1>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded-lg min-h-[44px]">
          Sign Out
        </button>
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
