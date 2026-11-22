import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSocket } from './hooks/useSocket';
import { api } from './lib/api';
import { useGameStore } from './stores/gameStore';

const Login = lazy(() => import('./routes/Login'));
const Register = lazy(() => import('./routes/Register'));
const AdminLogin = lazy(() => import('./routes/AdminLogin'));
const Spectator = lazy(() => import('./routes/Spectator'));
const PlayDashboard = lazy(() => import('./routes/play/PlayDashboard'));
const AdminLayout = lazy(() => import('./routes/admin/AdminLayout'));
const AdminGame = lazy(() => import('./routes/admin/AdminGame'));
const AdminMap = lazy(() => import('./routes/admin/AdminMap'));
const AdminTeams = lazy(() => import('./routes/admin/AdminTeams'));
const AdminLevels = lazy(() => import('./routes/admin/AdminLevels'));
const AdminPhotos = lazy(() => import('./routes/admin/AdminPhotos'));
const AdminLeaderboard = lazy(() => import('./routes/admin/AdminLeaderboard'));

function RequireAuth({ role, children }: { role: 'team' | 'admin'; children: JSX.Element }) {
  const authRole = useAuthStore((s) => s.role);
  if (authRole !== role) return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  return children;
}

function AppInner() {
  useSocket();
  const role = useAuthStore((s) => s.role);
  const { setGame, setProgress, setRankings } = useGameStore();

  useEffect(() => {
    if (role === 'team') {
      api.getParticipantGame().then((d) => {
        setGame(d.game);
        setProgress(d.progress);
      }).catch(() => {});
    } else if (role === 'admin') {
      api.getLeaderboard().then((d) => setRankings(d.rankings)).catch(() => {});
    }
  }, [role]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-white">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/spectator" element={<Spectator />} />

        <Route path="/play" element={
          <RequireAuth role="team"><PlayDashboard /></RequireAuth>
        } />
        <Route path="/play/*" element={<Navigate to="/play" replace />} />

        <Route path="/admin" element={
          <RequireAuth role="admin"><AdminLayout /></RequireAuth>
        }>
          <Route index element={<Navigate to="game" replace />} />
          <Route path="game" element={<AdminGame />} />
          <Route path="map" element={<AdminMap />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="levels" element={<AdminLevels />} />
          <Route path="photos" element={<AdminPhotos />} />
          <Route path="leaderboard" element={<AdminLeaderboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div className="h-full bg-gray-950 text-gray-100 font-sans">
      <AppInner />
    </div>
  );
}
