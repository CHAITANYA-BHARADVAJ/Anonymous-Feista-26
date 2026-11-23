import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { requestFullscreen, enableAutoFullscreenOnFirstGesture } from '../lib/fullscreen';

export default function Register() {
  const [teamName, setTeamName] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration Status
  const [status, setStatus] = useState<{
    registrationOpen: boolean;
    gameStatus: string;
    registeredTeams: number;
    maxTeams: number;
    slotsRemaining: number;
  } | null>(null);

  const setTeam = useAuthStore((s) => s.setTeam);
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    api.getRegistrationStatus()
      .then(setStatus)
      .catch(() => {});
    return cleanup;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (code.trim().length < 4) {
      setError('Access Password must be at least 4 characters.');
      return;
    }
    if (code.trim() !== confirmCode.trim()) {
      setError('Passwords do not match. Please verify your passcode.');
      return;
    }

    setLoading(true);
    requestFullscreen().catch(() => {});

    try {
      const data = await api.registerTeam(
        teamName.trim(),
        leaderName.trim(),
        mobile.trim(),
        code.trim(),
      );

      setTeam(data.teamId, data.teamName, data.token || '');
      navigate('/play');
    } catch (err: any) {
      setError(err.message ?? 'Registration failed. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  }

  const isFull = status ? status.registeredTeams >= status.maxTeams : false;
  const isClosed = status ? !status.registrationOpen : false;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative bg-[#07080b] text-zinc-100 overflow-y-auto select-none font-sans">
      <div className="w-full max-w-sm relative z-10 flex flex-col gap-5 my-auto">
        {/* Terminal Header with Club Logo */}
        <div className="text-center flex flex-col items-center">
          <div className="relative mb-2.5 group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/30 to-emerald-500/30 blur-md opacity-75 group-hover:opacity-100 transition duration-500" />
            <div className="relative w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 p-2 flex items-center justify-center shadow-2xl overflow-hidden">
              <img
                src="/logo.png"
                alt="Anonymous Club Logo"
                className="w-full h-full object-contain filter drop-shadow"
              />
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
            ANONYMOUS SDMCET • CAMPUS HUNT 2026
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white mt-1">Squad Self-Registration</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Register your operative squad for the campus hunt</p>
        </div>

        {/* Live Registration Capacity Counter */}
        {status && (
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400 font-bold uppercase tracking-wider">Squad Slots:</span>
              <span className="text-cyan-300 font-bold">
                {status.registeredTeams} / {status.maxTeams} Registered
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (status.registeredTeams / status.maxTeams) * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span>{isClosed ? '🔴 REGISTRATION CLOSED' : '🟢 REGISTRATION OPEN'}</span>
              <span>{status.slotsRemaining} slots remaining</span>
            </div>
          </div>
        )}

        {/* Capacity / Closure Banner */}
        {isFull ? (
          <div className="bg-rose-950/80 border border-rose-500/40 rounded-2xl p-5 text-center flex flex-col gap-2">
            <span className="text-2xl">🚫</span>
            <h3 className="font-mono font-bold text-sm text-white uppercase">Registration Full</h3>
            <p className="text-xs text-rose-300 font-mono">
              Maximum capacity of {status?.maxTeams ?? 25} squads has been reached. Please report to the mission control desk at the main hall.
            </p>
            <Link to="/login" className="text-xs font-mono text-cyan-300 hover:underline mt-2">
              ← Back to Squad Login
            </Link>
          </div>
        ) : isClosed ? (
          <div className="bg-amber-950/80 border border-amber-500/40 rounded-2xl p-5 text-center flex flex-col gap-2">
            <span className="text-2xl">⏳</span>
            <h3 className="font-mono font-bold text-sm text-white uppercase">Registration Closed</h3>
            <p className="text-xs text-amber-300 font-mono">
              Public self-registration is currently locked by coordinators.
            </p>
            <Link to="/login" className="text-xs font-mono text-cyan-300 hover:underline mt-2">
              ← Return to Squad Login
            </Link>
          </div>
        ) : (
          /* Registration Form */
          <form
            onSubmit={handleSubmit}
            className="bg-zinc-950/90 border border-zinc-800 rounded-3xl p-6 space-y-3.5 shadow-2xl relative"
          >
            {/* Team Name */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                TEAM CALL-SIGN (NAME) *
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                placeholder="e.g. Cyber Phantoms"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 text-xs font-medium transition-all"
              />
            </div>

            {/* Squad Leader Name */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                SQUAD LEADER NAME *
              </label>
              <input
                type="text"
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
                required
                placeholder="e.g. Rahul Patil"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 text-xs font-medium transition-all"
              />
            </div>

            {/* Mobile / WhatsApp */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                MOBILE / WHATSAPP NUMBER *
              </label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                placeholder="e.g. 9876543210"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 text-xs font-mono transition-all"
              />
            </div>

            {/* Access Password & Confirmation */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                  ACCESS CODE *
                </label>
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-cyan-400 text-xs transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1">
                  CONFIRM CODE *
                </label>
                <input
                  type="password"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-cyan-400 text-xs transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="bg-rose-950/80 border border-rose-500/40 rounded-xl p-3 text-rose-300 text-xs font-mono font-medium text-center">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl transition-all min-h-[46px] mt-2 font-mono"
            >
              {loading ? 'REGISTERING SQUAD…' : 'REGISTER SQUAD & ENTER HUNT →'}
            </button>

            <div className="text-center pt-2 border-t border-zinc-900">
              <Link to="/login" className="text-xs font-mono text-zinc-400 hover:text-cyan-300 transition-colors">
                Already registered? <span className="text-cyan-400 font-bold underline">Login here</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
