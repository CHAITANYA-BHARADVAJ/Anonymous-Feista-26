import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function AdminTeams() {
  const [teams, setTeams] = useState<any[]>([]);
  const [game, setGame] = useState<any>(null);
  const [regStatus, setRegStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // New Team Form state
  const [teamName, setTeamName] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [mobile, setMobile] = useState('');
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
      alert(`Access code for "${resetCodeTeam.name}" has been updated to "${res.displayCode}".`);
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
      setFormSuccess(`✓ Team "${tName}" registered (Code: ${tCode})`);
      setRecentCredentials((prev) => ({ ...prev, [tName]: tCode }));
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

  const filtered = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto pb-24 font-sans text-zinc-100">
      {/* Header */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white">Teams & Roster Desk</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-cyan-300 font-bold border border-zinc-700">
              {teams.length} / {game?.maxTeams ?? 25} Squads
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Manage participating teams, public self-registration status, and credential distribution slips.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-all flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>Print Login Slips</span>
          </button>
        </div>
      </div>

      {/* PUBLIC SELF-REGISTRATION MANAGEMENT CARD */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-3.5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>🌐</span>
                <span>Public Squad Self-Registration Gateway</span>
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  game?.registrationOpen
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {game?.registrationOpen ? '🟢 OPEN (TEAMS CAN SELF-REGISTER)' : '🔴 LOCKED (REGISTRATION CLOSED)'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Share the public link with participants. Teams choose their call-sign, leader details, and access passcode directly.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleRegistration}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                game?.registrationOpen
                  ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {game?.registrationOpen ? 'Lock Registration' : 'Open Registration'}
            </button>
          </div>
        </div>

        {/* Link Share Box */}
        <div className="flex flex-col sm:flex-row items-center gap-2 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
          <span className="text-xs font-mono text-zinc-400 shrink-0">Registration Link:</span>
          <code className="text-xs font-mono text-cyan-300 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 flex-1 truncate select-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'}
          </code>
          <button
            onClick={handleCopyRegLink}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold transition-all flex items-center gap-1 shrink-0"
          >
            <span>{copiedLink ? '✓ Copied!' : '📋 Copy Link'}</span>
          </button>
        </div>
      </div>

      {/* Registration Form Card */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Register New Team</h3>
        <p className="text-xs text-zinc-400 mb-3 font-mono">
          Teams log in using their Team Name and Access Code at <span className="text-zinc-200 underline">/login</span>.
        </p>

        {formError && (
          <div className="p-2.5 mb-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
            ⚠️ {formError}
          </div>
        )}

        {formSuccess && (
          <div className="p-2.5 mb-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
            {formSuccess}
          </div>
        )}

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-zinc-400">Team Call-Sign</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Team Gamma, CodeBreakers"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="md:col-span-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-zinc-400">Access Code</label>
              <button
                type="button"
                onClick={generateRandomCode}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 font-mono underline"
              >
                Auto-generate
              </button>
            </div>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="e.g. hunt2026, sdm782"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-3 rounded-xl bg-zinc-100 hover:bg-white active:scale-95 text-zinc-950 text-xs font-semibold shadow transition-all min-h-[38px] flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? 'Registering…' : '+ Register Team'}
            </button>
          </div>
        </form>
      </div>

      {/* Team Roster Grid */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Registered Teams Roster</h3>
            <p className="text-xs text-zinc-400 font-mono">Manage credentials and monitor team progress.</p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-zinc-500 w-48"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">Loading roster…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-xs">
            {teams.length === 0
              ? 'No teams registered yet. Use the form above to enrol your first team.'
              : 'No teams match your search.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((t) => {
              const currentProgress = t.levelProgress?.[0];
              const isFinished = Boolean(t.finishedAt);
              const codeDisplay = t.displayCode || recentCredentials[t.name] || 'Not set';
              const penaltyMinutes = t.penalties?.reduce((acc: number, p: any) => acc + (p.minutes || 0), 0) ?? 0;

              return (
                <div
                  key={t.id}
                  className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-white text-sm">{t.name}</h4>
                      {t.leaderName && (
                        <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          Leader: <strong className="text-zinc-200">{t.leaderName}</strong> {t.mobile ? `(${t.mobile})` : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-zinc-400 font-mono">Code:</span>
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-amber-300 font-mono font-bold text-xs select-all">
                          {codeDisplay}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(t.id, codeDisplay)}
                          className="text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 font-mono transition-all"
                          title="Copy Access Code"
                        >
                          {copiedTeamId === t.id ? '✓ Copied' : '📋 Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetCodeTeam(t);
                            setNewCodeInput('');
                          }}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 font-mono transition-all"
                          title="Reset / Set new access code"
                        >
                          🔑 Reset
                        </button>
                      </div>
                    </div>

                    {isFinished ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                        FINISHED 🏁
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-bold shrink-0">
                        {currentProgress ? `Step ${currentProgress.stepNumber ?? 1} / 10` : 'Standby'}
                      </span>
                    )}
                  </div>

                  <div className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 text-[11px]">
                      {isFinished
                        ? `Finished ${new Date(t.finishedAt).toLocaleTimeString()}`
                        : currentProgress?.level?.title ?? 'Ready'}
                    </span>
                    {penaltyMinutes !== 0 && (
                      <span className={`text-[11px] font-bold ${penaltyMinutes > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {penaltyMinutes > 0 ? `+${penaltyMinutes}` : penaltyMinutes}m
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-zinc-800/60">
                    <button
                      onClick={() => {
                        setResetCodeTeam(t);
                        setNewCodeInput('');
                      }}
                      className="px-2.5 py-1 rounded-md bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono flex items-center gap-1"
                      title="Reset or change team access code"
                    >
                      <span>🔑</span>
                      <span>Reset Code</span>
                    </button>
                    <button
                      onClick={() => handleReset(t.id, t.name)}
                      className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono"
                      title="Reset progress to Stage 1"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.name)}
                      className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 text-[11px] font-mono"
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
      </div>

      {/* Printable Slips Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="font-semibold text-white text-sm">Team Login Slips</h3>
                <p className="text-xs text-zinc-400 font-mono">Distribute to team captains at check-in.</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-2 flex-1">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="bg-zinc-950 p-3 rounded-xl border border-dashed border-zinc-800 flex items-center justify-between font-mono text-xs"
                >
                  <div>
                    <span className="text-[9px] text-zinc-500 uppercase block">SDMCET CAMPUS HUNT 2026</span>
                    <h4 className="font-bold text-white text-sm">{t.name}</h4>
                    <span className="text-zinc-500 text-[11px]">URL: /login</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] text-zinc-500 block uppercase">Code</span>
                    <span className="text-sm font-bold text-zinc-100 bg-zinc-800 px-2.5 py-0.5 rounded border border-zinc-700">
                      {t.displayCode || recentCredentials[t.name] || 'hunt2026'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs"
              >
                Print / Save PDF
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Team Access Code Modal */}
      {resetCodeTeam && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="font-semibold text-white text-sm">Reset Access Code</h3>
                <p className="text-xs text-cyan-400 font-mono">Squad: {resetCodeTeam.name}</p>
              </div>
              <button
                onClick={() => setResetCodeTeam(null)}
                className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewCode} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  New Access Code (letters & numbers):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCodeInput}
                    onChange={(e) => setNewCodeInput(e.target.value)}
                    placeholder="e.g. cyber26"
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500 uppercase tracking-wider"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateResetCode}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono"
                    title="Generate random password"
                  >
                    🎲 Gen
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
                Saving this will immediately update the squad's password and terminate any active sessions on their phones.
              </p>

              <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetCodeTeam(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingCode || !newCodeInput.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
                >
                  {isResettingCode ? 'Updating…' : 'Update Access Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
