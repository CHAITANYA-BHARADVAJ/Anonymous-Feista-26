import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function requireAuth(role?: 'team' | 'admin') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token = req.cookies?.ch_token as string | undefined;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    try {
      const payload = verifyToken(token);
      if (role && payload.role !== role) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      // Check jti revocation (team sessions only)
      if (payload.role === 'team') {
        const session = await prisma.teamSession.findUnique({ where: { jti: payload.jti } });
        if (!session || session.revokedAt) {
          res.status(401).json({ error: 'Session expired' });
          return;
        }
      }
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
