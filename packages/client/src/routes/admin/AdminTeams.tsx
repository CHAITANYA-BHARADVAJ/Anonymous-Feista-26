import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function AdminTeams() {
  const [teams, setTeams] = useState<any[]>([]);
  const [game, setGame] = useState<any>(null);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);

  // New Team Form state
  const [teamName, setTeamName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Printable Cards Modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [recentCredentials, setRecentCredentials] = useState<Record<string, string>>({
    'Team Alpha': 'alpha26',
    'Team Beta': 'beta26',
  });

  // Reset Access Code Modal state
  const [resetCodeTeam, setResetCodeTeam] = useState<any | null>(null);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [isResettingCode, setIsResettingCode] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState<number | null>(null);

  function handleCopyCode(teamId: number, code: string) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedTeamId(teamId);
    setTimeout(() => setCopiedTeamId(null), 2000);
  }

  function generateResetCode() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewCodeInput(code);
  }

  async function handleSaveNewCode(e: React.FormEvent) {
    e.preventDefault();
    if (!resetCodeTeam || !newCodeInput.trim()) return;

    setIsResettingCode(true);
    try {
      const res = await api.resetTeamAccessCode(resetCodeTeam.id, newCodeInput.trim());
      setTeams((prev) =>
        prev.map((t) => (t.id === resetCodeTeam.id ? { ...t, displayCode: res.displayCode } : t)),
      );
      setRecentCredentials((prev) => ({ ...prev, [resetCodeTeam.name]: res.displayCode }));
      alert(`Access code for "${resetCodeTeam.name}" updated to "${res.displayCode}".`);
      setResetCodeTeam(null);
      setNewCodeInput('');
      await loadTeams();
    } catch (err: any) {
      alert(err.message ?? 'Failed to update access code');
    } finally {
      setIsResettingCode(false);
    }
  }

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    setLoading(true);
    try {
      const [data, games, reg] = await Promise.all([
        api.getAdminTeams(),
        api.getGames(),
        api.getRegistrationStatus().catch(() => null),
      ]);
      setTeams(data);
      setGame(games[0] ?? null);
      setRegStatus(reg);
    } catch (err: any) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleRegistration() {
    if (!game) return;
    try {
      const nextState = !game.registrationOpen;
      await api.updateGameSettings(game.id, { registrationOpen: nextState });
      setGame((g: any) => ({ ...g, registrationOpen: nextState }));
      if (regStatus) setRegStatus((r: any) => ({ ...r, registrationOpen: nextState }));
    } catch (err: any) {
      alert(err.message ?? 'Failed to toggle registration');
    }
  }

  function handleCopyRegLink() {
    const url = `${window.location.origin}/register`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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

    const tName = teamName.trim();
    const tCode = accessCode.trim();

    setIsSubmitting(true);
    try {
      await api.createTeam(tName, tCode);
      setFormSuccess(`✓ Team "${tName}" registered.`);
      setRecentCredentials((prev) => ({ ...prev, [tName]: tCode }));
      setTeamName('');
      setAccessCode('');
      setShowAddTeam(false);
      await loadTeams();
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to register team');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(teamId: number, name: string) {
    if (
      !confirm(
        `Are you sure you want to permanently delete "${name}"? This removes their progress, location logs, and sessions.`,
      )
    ) {
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
    if (!confirm(`Reset game progress for "${name}"? They will restart from Stage 1.`)) {
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

  const filtered = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* Header Bar */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">Teams & Roster</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-cyan-300 font-bold border border-zinc-700">
                {teams.length} / {game?.maxTeams ?? 25} Squads
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Enrol squads, manage credentials, and toggle registration.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Registration toggle pill */}
          <button
            onClick={handleToggleRegistration}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
              game?.registrationOpen
                ? 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-500/40'
            }`}
          >
            {game?.registrationOpen ? '🟢 Public Reg: Open' : '🔴 Public Reg: Locked'}
          </button>

          {/* Copy Reg URL */}
          <button
            onClick={handleCopyRegLink}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 transition-all flex items-center gap-1.5"
            title="Copy Public Registration URL"
          >
            <span>{copiedLink ? '✓ Copied' : '📋 Link'}</span>
          </button>

          {/* Add Team Button */}
          <button
            onClick={() => setShowAddTeam((s) => !s)}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow transition-all flex items-center gap-1 active:scale-95"
          >
            <span>{showAddTeam ? '✕ Cancel' : '+ Add Team'}</span>
          </button>

          {/* Print Slips */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 border border-zinc-700 transition-all flex items-center gap-1.5"
          >
            <span>🖨️ Slips</span>
          </button>
        </div>
      </div>

      {/* Expandable Add Team Form Card */}
      {showAddTeam && (
        <div className="bg-zinc-900/90 border border-cyan-500/30 rounded-2xl p-4 shadow-2xl animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Enrol New Squad
            </span>
            <button
              onClick={() => setShowAddTeam(false)}
              className="text-xs text-zinc-400 hover:text-white font-mono"
            >
              ✕
            </button>
          </div>

          {formError && (
            <div className="p-2 mb-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
              ⚠️ {formError}
            </div>
          )}

          <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-zinc-400">Team Call-Sign</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Cyber Phantoms"
                required
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="md:col-span-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">Access Code</label>
                <button
                  type="button"
                  onClick={generateRandomCode}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Generate
                </button>
              </div>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="e.g. alpha26"
                required
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-zinc-950 text-xs font-bold transition-all min-h-[38px] flex items-center justify-center shadow"
              >
                {isSubmitting ? 'Registering…' : 'Register Team ✓'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roster Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-mono text-zinc-400">
          Showing {filtered.length} of {teams.length} teams
        </span>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams by name…"
          className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-zinc-500 w-56"
        />
      </div>

      {/* Roster Cards */}
      {loading ? (
        <div className="py-12 text-center text-zinc-500 font-mono text-xs">Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 font-mono text-xs bg-zinc-900/40 rounded-2xl border border-zinc-800">
          {teams.length === 0 ? 'No teams registered yet.' : 'No teams match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => {
            const currentProgress = t.levelProgress?.[0];
            const isFinished = Boolean(t.finishedAt);
            const codeDisplay = t.displayCode || recentCredentials[t.name] || '••••••';
            const penaltyMinutes = t.penalties?.reduce((acc: number, p: any) => acc + (p.minutes || 0), 0) ?? 0;

            return (
              <div
                key={t.id}
                className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md hover:border-zinc-700 transition-all"
              >
                {/* Team Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">{t.name}</h4>
                    {t.leaderName && (
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        Leader: {t.leaderName} {t.mobile ? `(${t.mobile})` : ''}
                      </p>
                    )}
                  </div>

                  {isFinished ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 font-bold">
                      FINISHED 🏁
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold shrink-0">
                      {currentProgress ? `Step ${currentProgress.stepNumber ?? 1} / 10` : 'Standby'}
                    </span>
                  )}
                </div>

                {/* Access Code & Penalty Badges */}
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-[10px] uppercase">Code:</span>
                    <span className="text-amber-300 font-bold select-all">{codeDisplay}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(t.id, codeDisplay)}
                      className="text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-all"
                      title="Copy access code"
                    >
                      {copiedTeamId === t.id ? '✓' : 'Copy'}
                    </button>
                  </div>

                  {penaltyMinutes !== 0 && (
                    <span className={`text-[11px] font-bold ${penaltyMinutes > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {penaltyMinutes > 0 ? `+${penaltyMinutes}` : penaltyMinutes}m
                    </span>
                  )}
                </div>

                {/* Bottom Actions Row */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-800/60">
                  <button
                    onClick={() => {
                      setResetCodeTeam(t);
                      setNewCodeInput('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-mono transition-all"
                    title="Change access code"
                  >
                    Reset Code
                  </button>
                  <button
                    onClick={() => handleReset(t.id, t.name)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono transition-all"
                    title="Reset team to Stage 1"
                  >
                    Restart
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 text-[11px] font-mono transition-all"
                    title="Delete team"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reset Code Modal */}
      {resetCodeTeam && (
        <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-bold text-white text-sm">
                Reset Code: {resetCodeTeam.name}
              </h3>
              <button
                onClick={() => setResetCodeTeam(null)}
                className="text-zinc-400 hover:text-white font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewCode} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-400">New Access Code</label>
                <button
                  type="button"
                  onClick={generateResetCode}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Generate
                </button>
              </div>

              <input
                type="text"
                value={newCodeInput}
                onChange={(e) => setNewCodeInput(e.target.value)}
                placeholder="e.g. hunt992"
                required
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetCodeTeam(null)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingCode}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-zinc-950 text-xs font-bold font-mono"
                >
                  {isResettingCode ? 'Saving…' : 'Update Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Cards Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-2xl w-full max-h-[85vh] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Printable Team Login Slips</h3>
                <p className="text-xs text-zinc-400 font-mono">Distribution slips for squad leaders.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold font-mono"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="text-zinc-400 hover:text-white font-mono text-xs px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col gap-1 text-xs font-mono"
                >
                  <span className="font-bold text-white text-sm">{t.name}</span>
                  <span className="text-zinc-400 text-[11px]">Portal: {window.location.origin}/login</span>
                  <div className="mt-1 bg-zinc-900 p-1.5 rounded border border-zinc-800 text-amber-300 font-bold">
                    Code: {t.displayCode || recentCredentials[t.name] || '••••••'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
