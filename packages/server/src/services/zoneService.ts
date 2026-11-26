import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { prisma } from '../lib/prisma';
import { Server } from 'socket.io';
import { buildLeaderboard, invalidateLeaderboardCache } from './scoreService';

// In-memory caches to prevent SQLite read/write contention under 25-50 concurrent teams
const teamZoneState = new Map<number, Set<number>>(); // teamId -> Set<zoneId>
const teamCache = new Map<number, { name: string; leaderName: string | null }>();
const lastLocationPersist = new Map<number, number>(); // teamId -> last DB write timestamp
let cachedRestrictedZones: { id: number; gameId: number; label: string | null; penaltyMins: number; poly: any }[] | null = null;
let lastZonesFetch = 0;

export function invalidateZoneCache() {
  cachedRestrictedZones = null;
}

export function clearTeamRuntimeState(teamId: number) {
  teamZoneState.delete(teamId);
  teamCache.delete(teamId);
  lastLocationPersist.delete(teamId);
}

export function resetZoneRuntimeState() {
  teamZoneState.clear();
  teamCache.clear();
  lastLocationPersist.clear();
  cachedRestrictedZones = null;
}

async function getRestrictedZones() {
  const now = Date.now();
  if (cachedRestrictedZones && now - lastZonesFetch < 30_000) {
    return cachedRestrictedZones;
  }
  const zones = await prisma.mapZone.findMany({
    where: { kind: 'restricted', active: true },
  });

  const parsed: { id: number; gameId: number; label: string | null; penaltyMins: number; poly: any }[] = [];
  for (const z of zones) {
    try {
      const geoJson = JSON.parse(z.geoJson);
      if (Array.isArray(geoJson?.coordinates) && Array.isArray(geoJson.coordinates[0]) && geoJson.coordinates[0].length >= 4) {
        parsed.push({
          id: z.id,
          gameId: z.gameId,
          label: z.label,
          penaltyMins: z.penaltyMins,
          poly: polygon(geoJson.coordinates),
        });
      }
    } catch {
      console.warn(`⚠️ Skipping invalid restricted zone geoJson for zone #${z.id}`);
    }
  }

  cachedRestrictedZones = parsed;
  lastZonesFetch = now;
  return cachedRestrictedZones;
}

export async function handleLocationUpdate(
  io: Server,
  teamId: number,
  lat: number,
  lng: number,
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return;
  }

  const now = Date.now();

  // 1. Resolve team metadata from in-memory cache to avoid repeated SQLite reads
  let teamMeta = teamCache.get(teamId);
  if (!teamMeta) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, leaderName: true },
    });
    if (team) {
      teamMeta = { name: team.name, leaderName: team.leaderName };
      teamCache.set(teamId, teamMeta);
    }
  }

  // 2. Real-time 0ms broadcast to Game Master radar (zero DB overhead)
  io.to('admin').emit('admin:team_location', {
    teamId,
    teamName: teamMeta?.name ?? `Team #${teamId}`,
    leaderName: teamMeta?.leaderName,
    lat,
    lng,
    recordedAt: new Date(),
  });

  // 3. Throttle SQLite persistence to once every 12 seconds per team
  const lastPersist = lastLocationPersist.get(teamId) ?? 0;
  if (now - lastPersist >= 12_000) {
    lastLocationPersist.set(teamId, now);
    prisma.teamLocation.create({ data: { teamId, lat, lng, recordedAt: new Date() } }).catch(() => {});
  }

  // 4. In-memory restricted zone checking
  const restrictedZones = await getRestrictedZones();
  const prevZones = teamZoneState.get(teamId) ?? new Set<number>();
  const currentZones = new Set<number>();
  const pt = point([lng, lat]);
  let penaltyCreated = false;
  let breachGameId: number | null = null;

  for (const zone of restrictedZones) {
    if (booleanPointInPolygon(pt, zone.poly)) {
      currentZones.add(zone.id);
      if (!prevZones.has(zone.id)) {
        await prisma.penalty.create({
          data: { teamId, kind: 'zone', minutes: zone.penaltyMins, appliedAt: new Date() },
        });
        penaltyCreated = true;
        breachGameId = zone.gameId;
        io.to(`team:${teamId}`).emit('zone:entered', {
          zoneId: zone.id,
          label: zone.label,
          penaltyMins: zone.penaltyMins,
        });
        io.to('admin').emit('admin:zone_breach', {
          teamId,
          teamName: teamMeta?.name ?? `Team #${teamId}`,
          zoneId: zone.id,
          label: zone.label,
          penaltyMins: zone.penaltyMins,
        });
      }
    }
  }

  teamZoneState.set(teamId, currentZones);

  if (penaltyCreated) {
    invalidateLeaderboardCache();
    const rankings = await buildLeaderboard(true);
    if (breachGameId != null) {
      io.to(`game:${breachGameId}`).emit('leaderboard:updated', { rankings });
    }
    io.emit('leaderboard:updated', { rankings });
  }
}
