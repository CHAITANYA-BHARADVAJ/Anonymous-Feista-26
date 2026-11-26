import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { createRateLimiter } from '../middleware/rateLimit';

const router = Router();

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && req.secure,
    sameSite: 'lax' as const,
    maxAge: 12 * 60 * 60 * 1000,
  };
}

// Campus Wi-Fi / 4G NAT friendly limits: protect against brute-force per account & massive floods
const registerIpLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: 'Registration rate limit reached. Please wait a moment.',
});

const teamLoginAccountLimiter = createRateLimiter({
  windowMs: 5 * 60_000,
  max: 20,
  keyFn: (req) => `team:${req.ip}:${String(req.body?.name ?? '').trim().toLowerCase()}`,
  message: 'Too many login attempts for this squad. Please wait 5 minutes or contact Event Control.',
});

const adminLoginAccountLimiter = createRateLimiter({
  windowMs: 5 * 60_000,
  max: 15,
  keyFn: (req) => `admin:${req.ip}:${String(req.body?.username ?? '').trim().toLowerCase()}`,
  message: 'Too many administrator login attempts. Please wait 5 minutes.',
});

// Registration status for public self-registration page
router.get(
  '/registration/status',
  asyncHandler(async (_req, res) => {
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    const count = await prisma.team.count();
    const maxTeams = game?.maxTeams ?? 25;
    res.json({
      registrationOpen: game?.registrationOpen ?? true,
      gameStatus: game?.status ?? 'idle',
      registeredTeams: count,
      maxTeams,
      slotsRemaining: Math.max(0, maxTeams - count),
    });
  }),
);

// Team Self-Registration
router.post(
  '/team/register',
  registerIpLimiter,
  asyncHandler(async (req, res) => {
    const { name, leaderName, mobile, code } = req.body as {
      name?: string;
      leaderName?: string;
      mobile?: string;
      code?: string;
    };

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim() : '';
    const trimmedLeader = typeof leaderName === 'string' && leaderName.trim() ? leaderName.trim() : null;
    const trimmedMobile = typeof mobile === 'string' && mobile.trim() ? mobile.trim() : null;

    if (!trimmedName || trimmedName.length > 80) {
      res.status(400).json({ error: 'Team Call-Sign is required (max 80 characters).' });
      return;
    }
    if (trimmedCode.length < 4 || trimmedCode.length > 64) {
      res.status(400).json({ error: 'Access Password must be between 4 and 64 characters.' });
      return;
    }
    if (trimmedLeader && trimmedLeader.length > 80) {
      res.status(400).json({ error: 'Leader name must be at most 80 characters.' });
      return;
    }
    if (trimmedMobile && trimmedMobile.length > 30) {
      res.status(400).json({ error: 'Mobile number must be at most 30 characters.' });
      return;
    }

    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game && !game.registrationOpen) {
      res.status(403).json({ error: 'Public registration is currently closed by event coordinators.' });
      return;
    }

    const currentCount = await prisma.team.count();
    const maxCapacity = game?.maxTeams ?? 25;
    if (currentCount >= maxCapacity) {
      res.status(403).json({
        error: `Maximum squad capacity reached (${maxCapacity}/${maxCapacity} teams registered). Please contact coordinators.`,
      });
      return;
    }

    // Check duplicate name (case-insensitive check)
    const allTeams = await prisma.team.findMany({ select: { id: true, name: true } });
    const existing = allTeams.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      res.status(409).json({
        error: `Team call-sign "${trimmedName}" is already registered. Please choose another name.`,
      });
      return;
    }

    const hashedCode = await bcrypt.hash(trimmedCode, 10);

    let team;
    try {
      team = await prisma.team.create({
        data: {
          name: trimmedName,
          code: hashedCode,
          displayCode: trimmedCode,
          leaderName: trimmedLeader,
          mobile: trimmedMobile,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        res.status(409).json({
          error: `Team call-sign "${trimmedName}" is already registered. Please choose another name.`,
        });
        return;
      }
      throw err;
    }

    const { token, jti } = signToken(team.id, 'team');
    await prisma.teamSession.create({ data: { teamId: team.id, jti } });
    res.cookie('ch_token', token, cookieOptions(req));

    // If game is already running, allocate starting clue immediately
    if (game?.status === 'running') {
      try {
        const { dispatchNextConflictFreeClue } = await import('../services/dispatchService');
        const { io } = await import('../index');
        await dispatchNextConflictFreeClue(io, team.id, game.id);
      } catch (err) {
        console.warn('Rolling start clue allocation warning:', err);
      }
    }

    res.status(201).json({
      teamId: team.id,
      teamName: team.name,
      leaderName: team.leaderName,
      mobile: team.mobile,
      token,
    });
  }),
);

// Team login
router.post(
  '/team/login',
  teamLoginAccountLimiter,
  asyncHandler(async (req, res) => {
    const { name, code } = req.body as { name?: string; code?: string };
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedCode = typeof code === 'string' ? code.trim() : '';

    if (!trimmedName || !trimmedCode) {
      res.status(400).json({ error: 'Team name and access code required' });
      return;
    }

    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');
    let team = await prisma.team.findUnique({ where: { name: trimmedName } });
    if (!team) {
      const allTeams = await prisma.team.findMany();
      team =
        allTeams.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase()) ||
        allTeams.find((t) => norm(t.name) === norm(trimmedName)) ||
        allTeams.find(
          (t) =>
            norm(t.name) === norm(`Team ${trimmedName}`) ||
            norm(`Team ${t.name}`) === norm(trimmedName),
        ) ||
        null;
    }

    if (!team) {
      res.status(401).json({ error: 'Invalid team name or code' });
      return;
    }

    let matches = false;
    try {
      matches = await bcrypt.compare(trimmedCode, team.code);
    } catch {}

    // Fallback for mobile keyboards auto-capitalizing first letter when code was registered lowercase
    if (!matches && trimmedCode !== trimmedCode.toLowerCase()) {
      try {
        matches = await bcrypt.compare(trimmedCode.toLowerCase(), team.code);
      } catch {}
    }

    if (!matches) {
      res.status(401).json({ error: 'Invalid team name or code' });
      return;
    }

    // Revoke any existing sessions (1 active phone per squad)
    await prisma.teamSession.updateMany({
      where: { teamId: team.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const { token, jti } = signToken(team.id, 'team');
    await prisma.teamSession.create({ data: { teamId: team.id, jti } });

    res.cookie('ch_token', token, cookieOptions(req));
    res.json({
      teamId: team.id,
      teamName: team.name,
      token,
    });
  }),
);

// Admin login
router.post(
  '/admin/login',
  adminLoginAccountLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const expectedUser = (process.env.ADMIN_USERNAME || 'admin').replace(/['"]/g, '').trim();
    const expectedPass = (process.env.ADMIN_PASSWORD || 'admin123').replace(/['"]/g, '').trim();

    const userMatch = typeof username === 'string' && username.trim().toLowerCase() === expectedUser.toLowerCase();
    const passMatch = typeof password === 'string' && password.trim() === expectedPass;

    if (!userMatch || !passMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const { token } = signToken(0, 'admin');
    res.cookie('ch_token', token, cookieOptions(req));
    res.json({ role: 'admin', token });
  }),
);

// Logout
router.post(
  '/logout',
  requireAuth(),
  asyncHandler(async (req: AuthRequest, res) => {
    if (req.user?.role === 'team') {
      await prisma.teamSession.updateMany({
        where: { jti: req.user.jti },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie('ch_token');
    res.json({ ok: true });
  }),
);

export default router;
