import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSocket } from './hooks/useSocket';
import { api } from './lib/api';
import { useGameStore } from './stores/gameStore';

const Login = lazy(() => import('./routes/Login'));
const AdminLogin = lazy(() => import('./routes/AdminLogin'));
const Spectator = lazy(() => import('./routes/Spectator'));
const PlayLayout = lazy(() => import('./routes/play/PlayLayout'));
const Home = lazy(() => import('./routes/play/Home'));
const Clues = lazy(() => import('./routes/play/Clues'));
const MapView = lazy(() => import('./routes/play/MapView'));
const Leaderboard = lazy(() => import('./routes/play/Leaderboard'));
const Profile = lazy(() => import('./routes/play/Profile'));
const Camera = lazy(() => import('./routes/play/Camera'));
const AdminLayout = lazy(() => import('./routes/admin/AdminLayout'));
const AdminGame = lazy(() => import('./routes/admin/AdminGame'));
const AdminLevels = lazy(() => import('./routes/admin/AdminLevels'));
const AdminPhotos = lazy(() => import('./routes/admin/AdminPhotos'));

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
    }
    api.getLeaderboard().then((d) => setRankings(d.rankings)).catch(() => {});
  }, [role]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-white">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/spectator" element={<Spectator />} />

        <Route path="/play" element={
          <RequireAuth role="team"><PlayLayout /></RequireAuth>
        }>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="clues" element={<Clues />} />
          <Route path="map" element={<MapView />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="camera" element={<Camera />} />
        </Route>

        <Route path="/admin" element={
          <RequireAuth role="admin"><AdminLayout /></RequireAuth>
        }>
          <Route index element={<Navigate to="game" replace />} />
          <Route path="game" element={<AdminGame />} />
          <Route path="levels" element={<AdminLevels />} />
          <Route path="photos" element={<AdminPhotos />} />
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
