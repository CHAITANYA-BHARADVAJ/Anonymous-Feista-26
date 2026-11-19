import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 12 * 60 * 60 * 1000,
};

// Team login
router.post('/team/login', async (req, res) => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name || !code) {
    res.status(400).json({ error: 'name and code required' });
    return;
  }

  const team = await prisma.team.findUnique({ where: { name } });
  if (!team || !(await bcrypt.compare(code, team.code))) {
    res.status(401).json({ error: 'Invalid team name or code' });
    return;
  }

  // Revoke any existing sessions
  await prisma.teamSession.updateMany({
    where: { teamId: team.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { token, jti } = signToken(team.id, 'team');
  await prisma.teamSession.create({ data: { teamId: team.id, jti } });

  res.cookie('ch_token', token, COOKIE_OPTS);
  res.json({ teamId: team.id, teamName: team.name });
});

// Admin login
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const { token } = signToken(0, 'admin');
  res.cookie('ch_token', token, COOKIE_OPTS);
  res.json({ role: 'admin' });
});

// Logout
router.post('/logout', requireAuth(), async (req: AuthRequest, res) => {
  if (req.user?.role === 'team') {
    await prisma.teamSession.updateMany({
      where: { jti: req.user.jti },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie('ch_token');
  res.json({ ok: true });
});

export default router;
