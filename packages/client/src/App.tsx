import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSocket } from './hooks/useSocket';
import { api } from './lib/api';
import { useGameStore } from './stores/gameStore';
import FeedbackOverlay from './components/FeedbackOverlay';

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
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // If Zustand persist is still rehydrating on cold reload, do not kick user to login
  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#07080b] text-cyan-400 font-mono text-xs">
        CONNECTING OPERATIVE SESSION…
      </div>
    );
  }

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
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[100dvh] bg-[#07080b] text-cyan-400 font-mono text-xs gap-2.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="tracking-widest uppercase">LOADING INTERFACE…</span>
        </div>
      }
    >
      <Routes>
        <Route
          path="/"
          element={
            role === 'team' ? (
              <Navigate to="/play" replace />
            ) : role === 'admin' ? (
              <Navigate to="/admin/game" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
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

        <Route
          path="*"
          element={
            role === 'team' ? (
              <Navigate to="/play" replace />
            ) : role === 'admin' ? (
              <Navigate to="/admin/game" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div className="h-[100dvh] bg-[#07080b] text-gray-100 font-sans">
      <AppInner />
      <FeedbackOverlay />
    </div>
  );
}
