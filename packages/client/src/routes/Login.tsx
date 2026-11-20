import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setTeam = useAuthStore((s) => s.setTeam);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.teamLogin(name.trim(), code.trim());
      setTeam(data.teamId, data.teamName, '');
      navigate('/play/home');
    } catch (err: any) {
      setError(err.message ?? 'Authentication rejected: invalid team credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 relative bg-[#07080b] text-gray-100 overflow-hidden select-none font-sans">
      <div className="w-full max-w-sm relative z-10 flex flex-col gap-6">
        {/* Terminal Header with Club Logo */}
        <div className="text-center flex flex-col items-center">
          <div className="relative mb-3 group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-md opacity-75 group-hover:opacity-100 transition duration-500" />
            <div className="relative w-16 h-16 rounded-2xl bg-[#0c0e14] border border-white/10 p-2 flex items-center justify-center shadow-2xl overflow-hidden">
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
          <h1 className="text-2xl font-black tracking-tight text-white mt-1">Operative Terminal</h1>
          <p className="text-xs text-gray-400 mt-0.5">Authenticate team credentials to connect</p>
        </div>

        {/* Terminal Card */}
        <form onSubmit={handleSubmit} className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 space-y-4 shadow-2xl relative">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-1.5">
              TEAM CALL-SIGN
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="username"
              placeholder="e.g. Team Alpha"
              className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400 text-sm font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-1.5">
              ACCESS CODE
            </label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-gray-600 font-mono focus:outline-none focus:border-cyan-400 text-sm font-medium transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-500/40 rounded-xl p-3 text-red-300 text-xs font-mono font-medium text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-white hover:bg-gray-200 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl transition-all min-h-[46px] mt-2"
          >
            {loading ? 'AUTHENTICATING…' : 'CONNECT & COMMENCE →'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-mono text-cyan-400/90 font-medium tracking-wide">
            Designed and developed by Anonymous_SDMCET
          </p>
          <p className="text-[10px] font-mono text-gray-600 tracking-wider">
            SDMCET DHARWAD // RESTRICTED ACCESS
          </p>
        </div>
      </div>
    </div>
  );
}
