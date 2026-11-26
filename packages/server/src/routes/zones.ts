import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';
import { invalidateZoneCache } from '../services/zoneService';
import { asyncHandler, parsePositiveInt } from '../lib/asyncHandler';

const router = Router();

function validatePolygonGeoJson(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.type === 'Polygon' &&
      Array.isArray(parsed.coordinates) &&
      Array.isArray(parsed.coordinates[0]) &&
      parsed.coordinates[0].length >= 4
    ) {
      return raw;
    }
  } catch {}
  return null;
}

router.get(
  '/game/:gameId',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.gameId);
    if (!gameId) { res.status(400).json({ error: 'Invalid gameId' }); return; }
    const zones = await prisma.mapZone.findMany({ where: { gameId } });
    res.json(zones);
  }),
);

router.post(
  '/game/:gameId',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const gameId = parsePositiveInt(req.params.gameId);
    if (!gameId) { res.status(400).json({ error: 'Invalid gameId' }); return; }

    const { kind, label, geoJson, penaltyMins, active } = req.body as {
      kind?: string;
      label?: string;
      geoJson?: string;
      penaltyMins?: number;
      active?: boolean;
    };

    const validGeoJson = validatePolygonGeoJson(geoJson);
    if (!validGeoJson) {
      res.status(400).json({ error: 'Valid GeoJSON Polygon is required' });
      return;
    }

    const zoneKind = kind === 'play' || kind === 'permitted' || kind === 'restricted' ? kind : 'restricted';
    const zone = await prisma.mapZone.create({
      data: {
        gameId,
        kind: zoneKind,
        label: typeof label === 'string' && label.trim() ? label.trim() : null,
        geoJson: validGeoJson,
        penaltyMins: Number.isFinite(Number(penaltyMins)) ? Math.max(0, Math.round(Number(penaltyMins))) : 5,
        active: active !== undefined ? Boolean(active) : true,
      },
    });
    invalidateZoneCache();
    io.to(`game:${gameId}`).emit('zone:updated', { zone });
    res.status(201).json(zone);
  }),
);

router.put(
  '/:id',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid zone id' }); return; }

    const existing = await prisma.mapZone.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Zone not found' }); return; }

    const { kind, label, geoJson, penaltyMins, active } = req.body as {
      kind?: string;
      label?: string;
      geoJson?: string;
      penaltyMins?: number;
      active?: boolean;
    };

    let validatedGeo: string | undefined;
    if (geoJson !== undefined) {
      const parsed = validatePolygonGeoJson(geoJson);
      if (!parsed) { res.status(400).json({ error: 'Invalid GeoJSON Polygon' }); return; }
      validatedGeo = parsed;
    }

    const zone = await prisma.mapZone.update({
      where: { id },
      data: {
        ...(kind === 'play' || kind === 'permitted' || kind === 'restricted' ? { kind } : {}),
        ...(label !== undefined ? { label: typeof label === 'string' && label.trim() ? label.trim() : null } : {}),
        ...(validatedGeo ? { geoJson: validatedGeo } : {}),
        ...(penaltyMins !== undefined && Number.isFinite(Number(penaltyMins))
          ? { penaltyMins: Math.max(0, Math.round(Number(penaltyMins))) }
          : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
      },
    });
    invalidateZoneCache();
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game) io.to(`game:${game.id}`).emit('zone:updated', { zone });
    res.json(zone);
  }),
);

router.patch(
  '/:id/toggle',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid zone id' }); return; }

    const existing = await prisma.mapZone.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    const zone = await prisma.mapZone.update({
      where: { id },
      data: { active: !existing.active },
    });
    invalidateZoneCache();
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game) io.to(`game:${game.id}`).emit('zone:updated', { zone });
    res.json(zone);
  }),
);

router.delete(
  '/:id',
  requireAuth('admin'),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid zone id' }); return; }

    const existing = await prisma.mapZone.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Zone not found' }); return; }

    await prisma.mapZone.delete({ where: { id } });
    invalidateZoneCache();
    res.json({ ok: true });
  }),
);

export default router;
