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

// Registration status for public self-registration page
router.get('/registration/status', async (_req, res) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Team Self-Registration
router.post('/team/register', async (req, res) => {
  try {
    const { name, leaderName, mobile, code } = req.body as {
      name?: string;
      leaderName?: string;
      mobile?: string;
      code?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ error: 'Team Call-Sign is required.' });
      return;
    }
    if (!code?.trim() || code.trim().length < 4) {
      res.status(400).json({ error: 'Access Password must be at least 4 characters.' });
      return;
    }

    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const trimmedLeader = leaderName?.trim() || null;
    const trimmedMobile = mobile?.trim() || null;

    // Check game settings
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
    const allTeams = await prisma.team.findMany();
    const existing = allTeams.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      res.status(409).json({
        error: `Team call-sign "${trimmedName}" is already registered. Please choose another name.`,
      });
      return;
    }

    // Hash access code
    const hashedCode = await bcrypt.hash(trimmedCode, 10);

    const team = await prisma.team.create({
      data: {
        name: trimmedName,
        code: hashedCode,
        leaderName: trimmedLeader,
        mobile: trimmedMobile,
      },
    });

    // Create session token
    const { token, jti } = signToken(team.id, 'team');
    await prisma.teamSession.create({ data: { teamId: team.id, jti } });
    res.cookie('token', token, COOKIE_OPTS);

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
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message ?? 'Registration failed. Please try again.' });
  }
});

// Team login
router.post('/team/login', async (req, res) => {
  try {
    const { name, code } = req.body as { name?: string; code?: string };
    if (!name?.trim() || !code?.trim()) {
      res.status(400).json({ error: 'Team name and access code required' });
      return;
    }

    const trimmedName = name.trim();
    const trimmedCode = code.trim();

    // Look up exact match first, then case-insensitive
    let team = await prisma.team.findUnique({ where: { name: trimmedName } });
    if (!team) {
      const allTeams = await prisma.team.findMany();
      team = allTeams.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase()) ?? null;
    }

    if (!team) {
      res.status(401).json({ error: 'Invalid team name or code' });
      return;
    }

    // Verify bcrypt hash or plaintext fallback
    let matches = false;
    try {
      matches = await bcrypt.compare(trimmedCode, team.code);
    } catch {}
    if (!matches && team.code === trimmedCode) {
      matches = true;
    }

    if (!matches) {
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
  } catch (err: any) {
    console.error('Participant login exception:', err);
    res.status(500).json({ error: err.message ?? 'Login failed due to server error' });
  }
});

// Admin login
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const expectedUser = (process.env.ADMIN_USERNAME || 'admin').replace(/['"]/g, '').trim();
  const expectedPass = (process.env.ADMIN_PASSWORD || 'admin123').replace(/['"]/g, '').trim();

  if (username?.trim() !== expectedUser || password?.trim() !== expectedPass) {
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
