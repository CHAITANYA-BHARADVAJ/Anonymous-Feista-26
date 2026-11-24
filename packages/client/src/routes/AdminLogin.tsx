import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { requestFullscreen, enableAutoFullscreenOnFirstGesture } from '../lib/fullscreen';
import { AlertTriangleIcon, EyeIcon, EyeOffIcon } from '../components/Icons';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const role = useAuthStore((s) => s.role);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const setAdmin = useAuthStore((s) => s.setAdmin);
  const navigate = useNavigate();

  // If already authenticated, redirect straight to command desk
  useEffect(() => {
    if (hasHydrated) {
      if (role === 'admin') {
        navigate('/admin/game', { replace: true });
      } else if (role === 'team') {
        navigate('/play', { replace: true });
      }
    }
  }, [role, hasHydrated, navigate]);

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
      const res = await api.adminLogin(username, password);
      setAdmin(res?.token || '');
      navigate('/admin/game');
    } catch (err: any) {
      setError(err.message ?? 'Invalid administrator credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-5 py-10 relative bg-[#07080b] text-gray-100 overflow-y-auto select-none font-sans">
      <div className="w-full max-w-sm relative z-10 flex flex-col gap-6 my-auto animate-fade-in">
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
          <p className="text-xs text-zinc-400 mt-0.5">Authenticate field administrator credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="obsidian-surface rounded-3xl p-6 space-y-4 relative">
          <div>
            <label htmlFor="admin-username" className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1.5">
              OFFICIAL USERNAME
            </label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="admin"
              className="w-full px-4 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 text-sm font-medium transition-all"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold mb-1.5">
              PASSWORD
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="••••••••"
                className="w-full pl-4 pr-11 py-3 rounded-xl bg-[#07080b] border border-white/10 text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-400 text-sm font-medium transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="bg-rose-950/75 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-xs font-mono font-medium flex items-center justify-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] disabled:opacity-60 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl transition-all min-h-[46px] mt-2"
          >
            {loading ? 'AUTHENTICATING…' : 'ENTER COMMAND DESK →'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-mono text-amber-400/90 font-medium tracking-wide">
            Designed and developed by Anonymous_SDMCET
          </p>
          <p className="text-[10px] font-mono text-zinc-600 tracking-wider">
            SDMCET DHARWAD // EVENT CONTROL
          </p>
        </div>
      </div>
    </div>
  );
}
