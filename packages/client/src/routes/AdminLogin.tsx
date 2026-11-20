import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { requestFullscreen, enableAutoFullscreenOnFirstGesture } from '../lib/fullscreen';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAdmin = useAuthStore((s) => s.setAdmin);
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = enableAutoFullscreenOnFirstGesture();
    return cleanup;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    requestFullscreen().catch(() => {});
    try {
      await api.adminLogin(username, password);
      setAdmin('');
      navigate('/admin/game');
    } catch (err: any) {
      setError(err.message ?? 'Invalid administrator credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 relative bg-[#07080b] text-gray-100 overflow-hidden select-none font-sans">
      <div className="w-full max-w-sm relative z-10 flex flex-col gap-6">
        <div className="text-center flex flex-col items-center">
          <div className="relative mb-3 group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 blur-md opacity-75 group-hover:opacity-100 transition duration-500" />
            <div className="relative w-16 h-16 rounded-2xl bg-[#0c0e14] border border-amber-500/30 p-2 flex items-center justify-center shadow-2xl overflow-hidden">
              <img
                src="/logo.png"
                alt="Anonymous Club Logo"
                className="w-full h-full object-contain filter drop-shadow"
              />
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
            COMMAND DESK // ANONYMOUS SDMCET
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white mt-1">Coordinator Access</h1>
          <p className="text-xs text-gray-400 mt-0.5">Authenticate field administrator credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#0c0e14] border border-white/[0.08] rounded-3xl p-6 space-y-4 shadow-2xl relative">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-1.5">
              OFFICIAL USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="admin"
              className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-amber-400 text-sm font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-1.5">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-gray-600 font-mono focus:outline-none focus:border-amber-400 text-sm font-medium transition-all"
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
            className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-95 text-gray-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl transition-all min-h-[46px] mt-2"
          >
            {loading ? 'AUTHENTICATING…' : 'ENTER COMMAND DESK →'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-mono text-amber-400/90 font-medium tracking-wide">
            Designed and developed by Anonymous_SDMCET
          </p>
          <p className="text-[10px] font-mono text-gray-600 tracking-wider">
            AUTHORIZED PERSONNEL ONLY // SDMCET FIELD OPS
          </p>
        </div>
      </div>
    </div>
  );
}
