import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
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

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

export const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
});

app.use(cors({ origin: CLIENT_URL, credentials: true }));
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

registerSocketHandlers(io);

const PORT = Number(process.env.PORT ?? 3001);

server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await rescheduleTimers(io);
});
