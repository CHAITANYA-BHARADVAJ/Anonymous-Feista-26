import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma';
import { registerSocketHandlers } from './socket';
import { rescheduleTimers } from './services/timerService';

// Routes
import authRouter from './routes/auth';
import gamesRouter from './routes/games';
import levelsRouter from './routes/levels';
import zonesRouter from './routes/zones';
import participantRouter from './routes/participant';
import leaderboardRouter from './routes/leaderboard';
import adminRouter from './routes/admin';

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL;

export const io = new Server(server, {
  cors: {
    origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173'] : true,
    credentials: true,
  },
});

app.use(
  cors({
    origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173'] : true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Serve uploaded photos through authenticated route
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR ?? './uploads')));

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/games', gamesRouter);
app.use('/api/v1/levels', levelsRouter);
app.use('/api/v1/zones', zonesRouter);
app.use('/api/v1/participant', participantRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// Serve built React PWA client in production
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  console.log(`📦 Serving production client assets from: ${clientDist}`);
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

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
