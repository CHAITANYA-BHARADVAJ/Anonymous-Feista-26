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
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-center text-brand-400 mb-2">🎯 Campus Hunt</h1>
        <p className="text-center text-gray-400 mb-8">Enter your team credentials to begin</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Team Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-brand-400 text-base"
              placeholder="Team Alpha"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Team Code</label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-brand-400 text-base"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-800 active:scale-95 text-white font-semibold text-base transition-all min-h-[44px]"
          >
            {loading ? 'Signing in…' : 'Join the Hunt'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-8">
          Admin?{' '}
          <a href="/admin/login" className="text-brand-400 underline">Sign in here</a>
        </p>
      </div>
    </div>
  );
}
