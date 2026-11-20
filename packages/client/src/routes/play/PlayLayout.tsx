import { Outlet, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { api } from '../../lib/api';
import ZoneWarning from '../../components/ZoneWarning';
import AnnouncementBanner from '../../components/AnnouncementBanner';
import { MissionIcon, IntelIcon, RadarIcon, RanksIcon, TeamIcon } from '../../components/Icons';
import { requestFullscreen, isFullscreen, toggleFullscreen, enableAutoFullscreenOnFirstGesture } from '../../lib/fullscreen';

const NAV = [
  { to: 'home', label: 'Briefing', icon: MissionIcon },
  { to: 'clues', label: 'Intel', icon: IntelIcon },
  { to: 'map', label: 'Radar', icon: RadarIcon },
  { to: 'leaderboard', label: 'Standings', icon: RanksIcon },
  { to: 'profile', label: 'Operative', icon: TeamIcon },
];

export default function PlayLayout() {
  const connected = useGameStore((s) => s.connected);
  const game = useGameStore((s) => s.game);
  const [fullscreenActive, setFullscreenActive] = useState(false);

  useEffect(() => {
    // Attempt auto fullscreen on the very first screen interaction
    const cleanup = enableAutoFullscreenOnFirstGesture();

    const updateFs = () => setFullscreenActive(isFullscreen());
    updateFs();

    document.addEventListener('fullscreenchange', updateFs);
    document.addEventListener('webkitfullscreenchange', updateFs);

    return () => {
      cleanup();
      document.removeEventListener('fullscreenchange', updateFs);
      document.removeEventListener('webkitfullscreenchange', updateFs);
    };
  }, []);

  async function handleSOS() {
    if (!confirm('DISPATCH EMERGENCY SOS TO FIELD COORDINATORS?\nYour exact GPS coordinates and timestamp will be transmitted to the command desk.')) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await api.sendSOS(pos.coords.latitude, pos.coords.longitude);
      alert('EMERGENCY SOS TRANSMITTED. Command desk notified of your coordinates.');
    });
  }

  return (
    <div className="flex flex-col h-full max-w-md mx-auto relative bg-[#07080b] text-gray-100 shadow-2xl overflow-hidden font-sans">
      {/* Precision Signal Indicator Bar */}
      {!connected && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-center text-[11px] py-1 px-4 font-mono font-medium flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="uppercase tracking-wider">Telemetry Stream Reconnecting…</span>
        </div>
      )}

      {/* Floating Tactical Fullscreen Re-engage Button (when not in fullscreen) */}
      {!fullscreenActive && (
        <button
          onClick={() => toggleFullscreen()}
          className="fixed top-2.5 right-2.5 z-50 px-2.5 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md shadow-lg active:scale-95 transition-all"
          title="Engage Fullscreen Mode"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          <span>HUD ⛶</span>
        </button>
      )}

      <AnnouncementBanner />

      {/* Main Content Viewport */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-y-auto">
        <Outlet />
      </main>

      {/* Tactile Distress Beacon (SOS) */}
      {game?.status === 'running' && (
        <button
          onClick={handleSOS}
          className="fixed bottom-20 right-4 z-40 w-11 h-11 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-400 hover:text-red-200 text-xs font-mono font-black shadow-2xl flex items-center justify-center active:scale-95 transition-all backdrop-blur-xl"
          title="Field Emergency Distress Beacon"
        >
          SOS
        </button>
      )}

      {/* Minimalist Tactile Dock */}
      <nav className="bg-[#0c0e14]/95 backdrop-blur-2xl border-t border-white/[0.07] flex items-center justify-around safe-bottom px-2 py-1 select-none z-30">
        {NAV.map(({ to, label, icon: IconComponent }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => requestFullscreen().catch(() => {})}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 px-1 min-h-[54px] rounded-xl transition-all relative ${
                isActive
                  ? 'text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-lg transition-transform ${isActive ? 'scale-105 text-cyan-400' : ''}`}>
                  <IconComponent className="w-5 h-5" />
                </div>
                <span className={`text-[10px] tracking-tight uppercase font-mono mt-0.5 ${isActive ? 'text-white font-bold' : 'text-gray-400'}`}>
                  {label}
                </span>
                {isActive && (
                  <div className="absolute bottom-1 w-1 h-1 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <ZoneWarning />
    </div>
  );
}
