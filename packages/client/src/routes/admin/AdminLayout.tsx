import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { getSocket, disconnectSocket } from '../../lib/socket';
import { toggleFullscreen, enableAutoFullscreenOnFirstGesture } from '../../lib/fullscreen';

export default function AdminLayout() {
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const [sosCount, setSosCount] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    loadBadges();

    const socket = getSocket();
    socket.on('sos:received', () => setSosCount((c) => c + 1));
    socket.on('sos:resolved', () => setSosCount((c) => Math.max(0, c - 1)));
    socket.on('admin:photo_submitted', () => setPendingPhotos((c) => c + 1));

    return () => {
      cleanup();
      socket.off('sos:received');
      socket.off('sos:resolved');
      socket.off('admin:photo_submitted');
    };
  }, []);

  async function loadBadges() {
    try {
      const [sos, photos] = await Promise.all([
        api.getSosAlerts().catch(() => []),
        api.getAdminPhotos().catch(() => []),
      ]);
      setSosCount(sos.length);
      setPendingPhotos(photos.filter((p: any) => p.status === 'pending').length);
    } catch {}
  }

  async function logout() {
    await api.logout().catch(() => {});
    clear();
    disconnectSocket();
    navigate('/admin/login');
  }

  const NAV_ITEMS = [
    {
      to: 'game',
      label: 'Command Desk',
      sublabel: 'Live Operations & Control',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      badge: sosCount > 0 ? `${sosCount} SOS` : null,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
    },
    {
      to: 'teams',
      label: 'Teams & Roster',
      sublabel: 'Credentials & Passwords',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      to: 'levels',
      label: 'Map & Clues Studio',
      sublabel: 'Satellite Picker & Geofence',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
    },
    {
      to: 'photos',
      label: 'Photo Queue',
      sublabel: 'Verification & Review',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      badge: pendingPhotos > 0 ? String(pendingPhotos) : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono',
    },
    {
      to: 'leaderboard',
      label: 'Standings & Podium',
      sublabel: 'Adjusted Times & Export',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      {/* ======================================================== */}
      {/* 1. LEFT SLIDING SIDEBAR (Hover expansion on desktop)    */}
      {/* ======================================================== */}
      <aside
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`hidden md:flex flex-col justify-between bg-zinc-900/90 border-r border-zinc-800/80 backdrop-blur-xl z-40 transition-all duration-300 ease-in-out relative ${
          isSidebarHovered ? 'w-64 shadow-2xl shadow-black/80' : 'w-16'
        }`}
      >
        {/* Top Header / Branding */}
        <div>
          <div className="flex items-center h-16 px-3.5 border-b border-zinc-800/70 overflow-hidden">
            <div className="flex items-center gap-3 min-w-[200px]">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-8 h-8 rounded-lg object-contain bg-zinc-950 p-1 border border-zinc-800 flex-shrink-0"
              />
              <div
                className={`flex flex-col transition-opacity duration-200 ${
                  isSidebarHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <span className="text-xs font-bold text-zinc-100 tracking-tight leading-none">
                  SDMCET HUNT
                </span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">
                  ANONYMOUS 2026
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-1 mt-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center h-11 rounded-xl transition-all relative overflow-hidden group ${
                    isActive
                      ? 'bg-zinc-800/90 text-white font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  } ${isSidebarHovered ? 'px-3.5' : 'justify-center px-0'}`
                }
                title={!isSidebarHovered ? item.label : undefined}
              >
                {/* Active Indicator Bar */}
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-zinc-100 rounded-r" />
                    )}

                    {/* Icon */}
                    <div className="flex items-center justify-center text-zinc-400 group-hover:text-zinc-200">
                      {item.icon}
                    </div>

                    {/* Expanded Label & Sublabel */}
                    <div
                      className={`ml-3 flex flex-col justify-center whitespace-nowrap overflow-hidden transition-all duration-200 ${
                        isSidebarHovered ? 'opacity-100 max-w-[160px]' : 'opacity-0 max-w-0'
                      }`}
                    >
                      <span className="text-xs tracking-tight leading-none text-zinc-200">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5 leading-none">
                        {item.sublabel}
                      </span>
                    </div>

                    {/* Badge */}
                    {item.badge && isSidebarHovered && (
                      <span
                        className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold whitespace-nowrap ${item.badgeColor}`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Mini Badge Dot when collapsed */}
                    {item.badge && !isSidebarHovered && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-2 border-t border-zinc-800/70 space-y-1">
          {/* Fullscreen toggle */}
          <button
            onClick={() => toggleFullscreen()}
            className={`flex items-center h-10 w-full rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition-all ${
              isSidebarHovered ? 'px-3.5 justify-start' : 'justify-center'
            }`}
            title="Toggle Fullscreen"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span
              className={`ml-3 text-xs tracking-tight whitespace-nowrap transition-all duration-200 ${
                isSidebarHovered ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0'
              }`}
            >
              Fullscreen
            </span>
          </button>

          {/* Sign Out */}
          <button
            onClick={logout}
            className={`flex items-center h-10 w-full rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 transition-all ${
              isSidebarHovered ? 'px-3.5 justify-start' : 'justify-center'
            }`}
            title="Sign Out"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span
              className={`ml-3 text-xs tracking-tight whitespace-nowrap transition-all duration-200 ${
                isSidebarHovered ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0'
              }`}
            >
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN CONTENT AREA & MOBILE TOPBAR                     */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo" className="w-7 h-7 rounded-lg object-contain bg-zinc-950 p-1 border border-zinc-800" />
            <span className="text-xs font-bold text-zinc-100 tracking-tight">Admin Console</span>
          </div>

          <div className="flex items-center gap-2">
            {sosCount > 0 && (
              <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded-full animate-pulse">
                {sosCount} SOS
              </span>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Nav Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-zinc-900 border-b border-zinc-800 p-2 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${
                    isActive ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
            <div className="pt-2 border-t border-zinc-800 flex justify-between">
              <button
                onClick={() => toggleFullscreen()}
                className="text-xs text-zinc-400 px-3 py-1.5 rounded-lg bg-zinc-800"
              >
                ⛶ Fullscreen
              </button>
              <button
                onClick={logout}
                className="text-xs text-rose-400 px-3 py-1.5 rounded-lg bg-zinc-800"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content View */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
