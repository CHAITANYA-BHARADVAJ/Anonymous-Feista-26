import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Server } from 'socket.io';
import { validateProductionEnv } from './lib/env';
import { prisma } from './lib/prisma';
import { registerSocketHandlers } from './socket';
import { rescheduleTimers } from './services/timerService';
import { requireAuth, AuthRequest } from './middleware/auth';

// Routes
import authRouter from './routes/auth';
import gamesRouter from './routes/games';
import levelsRouter from './routes/levels';
import zonesRouter from './routes/zones';
import participantRouter from './routes/participant';
import leaderboardRouter from './routes/leaderboard';
import adminRouter from './routes/admin';

validateProductionEnv();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL;

export const io = new Server(server, {
  cors: {
    origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173'] : true,
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

app.use(
  cors({
    origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173'] : true,
    credentials: true,
  }),
);

// Security response headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Serve uploaded photos strictly through authenticated & path-safe handler
const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
app.get('/uploads/:teamId/:filename', requireAuth(), (req: AuthRequest, res) => {
  const requestedTeamId = Number(req.params.teamId);
  if (!Number.isInteger(requestedTeamId) || requestedTeamId <= 0) {
    res.status(400).json({ error: 'Invalid upload path' });
    return;
  }
  if (req.user?.role !== 'admin' && req.user?.sub !== requestedTeamId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const safeFilename = path.basename(req.params.filename || '');
  const teamDir = path.resolve(uploadRoot, String(requestedTeamId));
  const fullPath = path.resolve(teamDir, safeFilename);

  if (!fullPath.startsWith(teamDir + path.sep) || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(fullPath);
});

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/games', gamesRouter);
app.use('/api/v1/levels', levelsRouter);
app.use('/api/v1/zones', zonesRouter);
app.use('/api/v1/participant', participantRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/api/v1/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1;');
    res.json({ ok: true, db: 'ok', uptimeSecs: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

// Serve built React PWA client in production (skip during `npm run dev` so Vite :5173 stays the sole UI)
const clientDist = path.resolve(__dirname, '../../client/dist');
if (process.env.npm_lifecycle_event !== 'dev' && fs.existsSync(clientDist)) {
  console.log(`📦 Serving production client assets from: ${clientDist}`);
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (base === 'index.html' || base === 'sw.js' || base === 'registerSW.js' || base === 'manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-store, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handler (handles Multer upload errors, JSON parse errors, and route rejections cleanly)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: err.message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON request body' });
    return;
  }
  if (err?.message?.includes('Only JPEG/PNG/WebP images')) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('Unhandled server error:', err);
  res.status(err?.status ?? 500).json({ error: err?.message ?? 'Internal server error' });
});

registerSocketHandlers(io);

const PORT = Number(process.env.PORT ?? 3001);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    console.log('⚡ SQLite WAL mode and 5000ms busy_timeout activated');
  } catch (e) {
    console.warn('⚠️ Could not configure SQLite WAL pragma:', e);
  }
  await rescheduleTimers(io);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 Received ${signal}, gracefully shutting down...`);
  io.close(() => {});
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
