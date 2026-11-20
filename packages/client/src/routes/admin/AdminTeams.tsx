import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function AdminTeams() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // New Team Form state
  const [teamName, setTeamName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    setLoading(true);
    try {
      const data = await api.getAdminTeams();
      setTeams(data);
    } catch (err: any) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }

  function generateRandomCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setAccessCode(code);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!teamName.trim() || !accessCode.trim()) {
      setFormError('Please enter both team name and access code.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createTeam(teamName.trim(), accessCode.trim());
      setFormSuccess(`✓ Team "${teamName.trim()}" successfully registered! Code: "${accessCode.trim()}"`);
      setTeamName('');
      setAccessCode('');
      await loadTeams();
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to register team');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(teamId: number, name: string) {
    if (!confirm(`Are you sure you want to permanently delete "${name}"? This removes all their progress, location logs, and sessions.`)) {
      return;
    }
    try {
      await api.deleteTeam(teamId);
      await loadTeams();
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete team');
    }
  }

  async function handleReset(teamId: number, name: string) {
    if (!confirm(`Reset game progress for "${name}"? They will restart from Level 1.`)) {
      return;
    }
    try {
      await api.resetTeamProgress(teamId);
      await loadTeams();
      alert(`Progress reset for "${name}".`);
    } catch (err: any) {
      alert(err.message ?? 'Failed to reset team');
    }
  }

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 flex flex-col gap-6 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">👥 Team Registration & Roster</h2>
          <p className="text-xs text-gray-400 mt-1">
            Register new participating teams, manage credentials, and monitor team status for SDMCET Campus Hunt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-brand-900 text-brand-300 px-3 py-1.5 rounded-full font-mono font-bold">
            {teams.length} Teams Registered
          </span>
        </div>
      </div>

      {/* Registration Form Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <span>➕</span> Register New Team
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Teams log in using their Team Name and Access Code at{' '}
          <span className="text-brand-400 font-mono">http://localhost:5173/login</span>.
        </p>

        {formError && (
          <div className="p-3 mb-4 rounded-xl bg-red-950/80 border border-red-600/50 text-red-300 text-xs font-medium">
            ⚠️ {formError}
          </div>
        )}

        {formSuccess && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs font-medium">
            {formSuccess}
          </div>
        )}

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-300">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Team Gamma, CodeBreakers"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-white text-sm focus:outline-none focus:border-brand-400"
            />
          </div>

          <div className="md:col-span-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300">Access Code</label>
              <button
                type="button"
                onClick={generateRandomCode}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium underline"
              >
                Auto-generate
              </button>
            </div>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="e.g. hunt2026, sdm782"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-white font-mono text-sm focus:outline-none focus:border-brand-400"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-95 text-white text-sm font-bold shadow-lg shadow-brand-600/30 transition-all min-h-[44px] flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <span>Registering…</span>
              ) : (
                <>
                  <span>➕</span>
                  <span>Register Team</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Team Roster Grid */}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">Registered Teams</h3>
            <p className="text-xs text-gray-400">Manage credentials, reset status, and track team progress.</p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search teams…"
            className="px-3.5 py-2 rounded-xl bg-gray-950 border border-gray-700 text-white text-xs focus:outline-none focus:border-brand-400 w-56"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">Loading team roster…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            {teams.length === 0 ? 'No teams registered yet. Use the form above to add your first team.' : 'No teams match your search.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((t) => {
              const currentProgress = t.levelProgress?.[0];
              const isFinished = !!t.finishedAt;

              return (
                <div
                  key={t.id}
                  className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-gray-700 transition-all shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-950/80 border border-brand-500/30 flex items-center justify-center text-brand-300 font-black text-sm">
                        {t.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{t.name}</h4>
                        <p className="text-[11px] text-gray-400 font-mono">ID: #{t.id}</p>
                      </div>
                    </div>

                    {isFinished ? (
                      <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                        🏆 Finished
                      </span>
                    ) : (
                      <span className="text-[11px] bg-brand-500/10 text-brand-300 border border-brand-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                        {currentProgress?.level ? `Level ${currentProgress.level.orderIndex}` : 'Awaiting Start'}
                      </span>
                    )}
                  </div>

                  <div className="bg-gray-900/60 rounded-xl p-2.5 border border-gray-800/80 flex items-center justify-between text-xs">
                    <div className="text-gray-400">
                      <span>Status: </span>
                      <strong className="text-gray-200">
                        {isFinished
                          ? `Finished at ${new Date(t.finishedAt).toLocaleTimeString()}`
                          : currentProgress?.level?.title ?? 'Ready for Start'}
                      </strong>
                    </div>
                    {t.penalties?.length > 0 && (
                      <span className="text-red-400 font-semibold text-[11px]">
                        +{t.penalties.reduce((acc: number, p: any) => acc + p.penaltyMins, 0)}m penalty
                      </span>
                    )}
                  </div>

                  {/* Team Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-800/60">
                    <button
                      onClick={() => handleReset(t.id, t.name)}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-all"
                      title="Reset team's progress to restart from level 1"
                    >
                      🔄 Reset Progress
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.name)}
                      className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 text-xs font-semibold transition-all"
                      title="Delete team permanently"
                    >
                      🗑 Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
