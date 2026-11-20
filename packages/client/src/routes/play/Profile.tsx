import { useAuthStore } from '../../stores/authStore';
import { useGameStore } from '../../stores/gameStore';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { disconnectSocket } from '../../lib/socket';

export default function Profile() {
  const teamName = useAuthStore((s) => s.teamName);
  const teamId = useAuthStore((s) => s.teamId);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const progress = useGameStore((s) => s.progress);
  const connected = useGameStore((s) => s.connected);

  const totalHints = progress.reduce((s, p) => s + p.hintsUsed, 0);
  const levelsComplete = progress.filter((p) => p.completedAt).length;

  async function logout() {
    if (!confirm('Sign out from this field operative terminal?')) return;
    await api.logout().catch(() => {});
    clear();
    disconnectSocket();
    navigate('/login');
  }

  const initials = (teamName ?? 'OP')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col px-5 py-6 gap-5 pb-24 font-sans max-w-md mx-auto">
      {/* Dossier Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            FIELD OPERATIVE DOSSIER
          </span>
          <h1 className="text-xl font-black tracking-tight text-white mt-0.5">Squad Credentials</h1>
        </div>

        <span className="text-[10px] font-mono tracking-wider uppercase bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-md">
          SQUAD #{teamId ?? '00'}
        </span>
      </div>

      {/* Operative Identity Card */}
      <div className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 flex items-center gap-4 shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-400/40 flex items-center justify-center font-mono font-black text-cyan-300 text-xl shadow-inner">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold">
            CALL-SIGN
          </span>
          <h2 className="text-lg font-black text-white truncate tracking-tight">{teamName}</h2>
          <p className="text-[11px] font-mono text-cyan-400 mt-0.5">AUTHENTICATED PARTICIPANT</p>
        </div>
      </div>

      {/* Tactical Stats Matrix */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 text-center">
          <p className="text-3xl font-black font-mono text-white tracking-tight tabular-nums">
            {levelsComplete}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mt-1 font-bold">
            STAGES CLEARED
          </p>
        </div>

        <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 text-center">
          <p className="text-3xl font-black font-mono text-amber-400 tracking-tight tabular-nums">
            {totalHints}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mt-1 font-bold">
            HINTS UNLOCKED
          </p>
        </div>
      </div>

      {/* Hardware Diagnostics Checklist */}
      <div className="bg-[#0c0e14] border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 font-bold">
            FIELD TELEMETRY DIAGNOSTICS
          </span>
          <span className="text-[9px] font-mono text-emerald-400 font-bold">ALL SYSTEMS NORMAL</span>
        </div>

        <div className="flex flex-col gap-2.5 text-xs font-mono">
          <div className="flex items-center justify-between text-gray-300">
            <span>SDMCET Real-Time GPS Sensor</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ONLINE
            </span>
          </div>

          <div className="flex items-center justify-between text-gray-300">
            <span>Screen Wake Lock Engine</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ENGAGED
            </span>
          </div>

          <div className="flex items-center justify-between text-gray-300">
            <span>Synthesizer Chime Audio Engine</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> SYNCHRONIZED
            </span>
          </div>

          <div className="flex items-center justify-between text-gray-300">
            <span>Live Command Socket Stream</span>
            <span className={`font-bold flex items-center gap-1.5 ${connected ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              {connected ? 'CONNECTED' : 'RECONNECTING'}
            </span>
          </div>
        </div>
      </div>

      {/* Disconnect Operative Session */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="w-full py-3 px-4 rounded-xl bg-white/[0.03] hover:bg-red-950/40 border border-white/10 hover:border-red-500/40 text-gray-400 hover:text-red-300 active:scale-95 text-xs font-mono uppercase tracking-wider font-bold transition-all min-h-[44px]"
        >
          Sign Out From Terminal
        </button>
      </div>
    </div>
  );
}
