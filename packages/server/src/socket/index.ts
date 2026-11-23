import { Server, Socket } from 'socket.io';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { handleLocationUpdate } from '../services/zoneService';

function parseCookie(cookieHeader: string | undefined, key: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function registerSocketHandlers(io: Server) {
  io.use(async (socket, next) => {
    // Try auth token from handshake auth first, then fall back to cookie
    let token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      token = parseCookie(socket.handshake.headers.cookie, 'ch_token') || parseCookie(socket.handshake.headers.cookie, 'token');
    }
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
