import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export default function AdminGame() {
  const [game, setGame] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [nudgeTeamId, setNudgeTeamId] = useState<number | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState('');

  useEffect(() => {
    reload();
    const socket = getSocket();
    socket.on('game:status_changed', (data: any) => setGame((g: any) => g ? { ...g, ...data } : g));
    socket.on('sos:received', (alert: any) => setSos((prev) => [alert, ...prev]));
    socket.on('admin:team_location', ({ teamId, lat, lng }: any) =>
      setTeams((prev) => prev.map((t) => t.id === teamId ? { ...t, _lat: lat, _lng: lng } : t))
    );
    return () => { socket.off('game:status_changed'); socket.off('sos:received'); socket.off('admin:team_location'); };
  }, []);

  async function reload() {
    const [games, teamsData, sosData] = await Promise.all([
      api.getGames(),
      api.getAdminTeams(),
      api.getSosAlerts(),
    ]);
    setGame(games[0] ?? null);
    setTeams(teamsData);
    setSos(sosData);
  }

  async function action(act: string) {
    if (!game) return;
    if (act === 'end' && !confirm('End the game for all teams?')) return;
    setLoading(true);
    try { await api.patchGameStatus(game.id, act); await reload(); }
    finally { setLoading(false); }
  }

  async function broadcast() {
    if (!game || !announcement.trim()) return;
    await api.sendAnnouncement(game.id, announcement.trim(), 'broadcast');
    setAnnouncement('');
  }

  async function sendNudge() {
    if (!game || !nudgeMsg.trim() || !nudgeTeamId) return;
    await api.sendAnnouncement(game.id, nudgeMsg.trim(), 'nudge', nudgeTeamId);
    setNudgeMsg('');
    setNudgeTeamId(null);
  }

  const statusColor: Record<string, string> = {
    idle: 'bg-gray-700', running: 'bg-green-700', paused: 'bg-yellow-700', ended: 'bg-red-800',
  };

  return (
    <div className="p-4 flex flex-col gap-6 pb-10">
      {/* Game status card */}
      <div className="bg-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{game?.name ?? 'No game'}</h2>
          {game && (
            <span className={`text-xs px-3 py-1 rounded-full font-semibold uppercase ${statusColor[game.status]}`}>
              {game.status}
            </span>
          )}
        </div>
        {game && (
          <div className="flex flex-wrap gap-2">
            {game.status === 'idle' && (
              <button onClick={() => action('start')} disabled={loading}
                className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold min-h-[44px]">
                ▶ Start Game
              </button>
            )}
            {game.status === 'running' && (
              <button onClick={() => action('pause')} disabled={loading}
                className="px-4 py-2 rounded-xl bg-yellow-600 text-white text-sm font-semibold min-h-[44px]">
                ⏸ Pause
              </button>
            )}
            {game.status === 'paused' && (
              <button onClick={() => action('resume')} disabled={loading}
                className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold min-h-[44px]">
                ▶ Resume
              </button>
            )}
            {(game.status === 'running' || game.status === 'paused') && (
              <button onClick={() => action('end')} disabled={loading}
                className="px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold min-h-[44px]">
                🏁 End Game
              </button>
            )}
          </div>
        )}
      </div>

      {/* Teams overview */}
      <div className="bg-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Teams ({teams.length})</h3>
        <div className="space-y-2">
          {teams.map((t) => {
            const level = t.levelProgress?.[0]?.level?.orderIndex ?? '—';
            const hints = t.penalties?.filter((p: any) => p.kind === 'hint').length ?? 0;
            return (
              <div key={t.id} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-gray-500">Level {level} · {hints} hint penalties</p>
                </div>
                <button
                  onClick={() => setNudgeTeamId(t.id)}
                  className="text-xs text-brand-400 px-3 py-1 rounded-lg bg-brand-900 min-h-[36px]"
                >
                  Nudge
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SOS Alerts */}
      {sos.length > 0 && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-red-400 uppercase mb-3">🆘 SOS Alerts</h3>
          {sos.slice(0, 5).map((s) => (
            <div key={s.id} className="text-sm mb-2">
              <span className="font-medium">{s.team?.name}</span>
              <span className="text-gray-400 ml-2">
                {s.lat.toFixed(5)}, {s.lng.toFixed(5)} — {new Date(s.sentAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast */}
      {game && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">📢 Broadcast</h3>
          <div className="flex gap-2">
            <input
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Message to all teams…"
              className="flex-1 px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none"
            />
            <button onClick={broadcast} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold min-h-[44px]">
              Send
            </button>
          </div>
        </div>
      )}

      {/* Nudge modal */}
      {nudgeTeamId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-3">Nudge {teams.find((t) => t.id === nudgeTeamId)?.name}</h3>
            <div className="flex gap-2 mb-3">
              {['🔥 Getting warmer!', '❄️ Getting colder…', '🎯 Very close!'].map((msg) => (
                <button key={msg} onClick={() => setNudgeMsg(msg)}
                  className={`flex-1 px-2 py-2 rounded-xl text-xs text-center min-h-[44px] border ${nudgeMsg === msg ? 'border-brand-400 text-brand-400' : 'border-gray-600 text-gray-400'}`}>
                  {msg}
                </button>
              ))}
            </div>
            <input
              value={nudgeMsg}
              onChange={(e) => setNudgeMsg(e.target.value)}
              placeholder="Custom message…"
              className="w-full px-3 py-2 mb-3 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setNudgeTeamId(null)} className="flex-1 py-2 rounded-xl bg-gray-700 text-white text-sm min-h-[44px]">
                Cancel
              </button>
              <button onClick={sendNudge} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold min-h-[44px]">
                Send Nudge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
