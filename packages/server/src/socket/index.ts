import { Server, Socket } from 'socket.io';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { handleLocationUpdate } from '../services/zoneService';

export function registerSocketHandlers(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      // Allow spectator connections without auth
      socket.data.role = 'spectator';
      return next();
    }
    try {
      const payload = verifyToken(token);
      if (payload.role === 'team') {
        const session = await prisma.teamSession.findUnique({ where: { jti: payload.jti } });
        if (!session || session.revokedAt) return next(new Error('Session revoked'));
      }
      socket.data.user = payload;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const role = socket.data.role as string;
    const user = socket.data.user;

    // Join appropriate rooms
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game) socket.join(`game:${game.id}`);

    if (role === 'team' && user) {
      socket.join(`team:${user.sub}`);
    } else if (role === 'admin') {
      socket.join('admin');
    } else {
      socket.join('spectator');
    }

    // Location updates from participants
    socket.on('location:update', async ({ lat, lng }: { lat: number; lng: number }) => {
      if (role !== 'team' || !user) return;
      const g = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
      if (!g || g.status !== 'running') return;
      await handleLocationUpdate(io, user.sub, lat, lng);
    });

    socket.on('join:spectator', () => {
      socket.join('spectator');
    });
  });
}
