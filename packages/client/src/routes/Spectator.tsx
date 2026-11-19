import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { formatMs } from '../hooks/useCountdown';

export default function Spectator() {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    api.getSpectatorState().then(setState);
    const socket = getSocket();
    socket.emit('join:spectator');
    socket.on('leaderboard:updated', ({ rankings }: any) =>
      setState((s: any) => s ? { ...s, rankings } : s));
    socket.on('game:status_changed', (data: any) =>
      setState((s: any) => s ? { ...s, game: { ...s.game, ...data } } : s));
    socket.on('game:announcement', (a: any) =>
      setState((s: any) => s ? { ...s, announcements: [a, ...(s.announcements ?? [])].slice(0, 5) } : s));
    return () => { socket.off('leaderboard:updated'); socket.off('game:status_changed'); socket.off('game:announcement'); };
  }, []);

  if (!state) return <div className="flex items-center justify-center h-screen text-white text-2xl">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 flex flex-col gap-8">
      <header className="text-center">
        <h1 className="text-5xl font-bold text-brand-400">🎯 Campus Hunt</h1>
        <p className="text-2xl text-gray-400 mt-2">{state.game?.name}</p>
        <span className={`inline-block mt-3 px-4 py-1 rounded-full text-lg font-semibold ${
          state.game?.status === 'running' ? 'bg-green-700' :
          state.game?.status === 'paused' ? 'bg-yellow-700' :
          state.game?.status === 'ended' ? 'bg-red-800' : 'bg-gray-700'
        }`}>{state.game?.status?.toUpperCase() ?? 'WAITING'}</span>
      </header>

      {state.announcements?.length > 0 && (
        <div className="bg-brand-900 border border-brand-600 rounded-2xl p-4 text-center text-xl">
          📢 {state.announcements[0].message}
        </div>
      )}

      <div className="bg-gray-900 rounded-2xl overflow-hidden">
        <table className="w-full text-xl">
          <thead className="bg-gray-800">
            <tr>
              <th className="p-4 text-left">Rank</th>
              <th className="p-4 text-left">Team</th>
              <th className="p-4 text-center">Level</th>
              <th className="p-4 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {state.rankings?.map((r: any, i: number) => (
              <tr key={r.teamId} className={`border-t border-gray-800 ${i === 0 ? 'bg-brand-900/40' : ''}`}>
                <td className="p-4 font-bold text-2xl">
                  {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                </td>
                <td className="p-4 font-semibold">{r.teamName}</td>
                <td className="p-4 text-center text-gray-400">Level {r.currentLevel}</td>
                <td className="p-4 text-right font-mono">
                  {r.finished && r.adjustedTimeSecs != null
                    ? formatMs(r.adjustedTimeSecs * 1000)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
