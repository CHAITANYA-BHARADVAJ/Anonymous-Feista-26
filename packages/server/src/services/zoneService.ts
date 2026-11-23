import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { prisma } from '../lib/prisma';
import { Server } from 'socket.io';

// In-memory caches to prevent SQLite read/write contention under 25-50 concurrent teams
const teamZoneState = new Map<number, Set<number>>(); // teamId → Set<zoneId>
const teamCache = new Map<number, { name: string; leaderName: string | null }>();
const lastLocationPersist = new Map<number, number>(); // teamId -> last DB write timestamp
let cachedRestrictedZones: { id: number; label: string | null; penaltyMins: number; poly: any }[] | null = null;
let lastZonesFetch = 0;

export function invalidateZoneCache() {
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
  cachedRestrictedZones = zones.map((z) => {
    const geoJson = JSON.parse(z.geoJson);
    return {
      id: z.id,
      label: z.label,
      penaltyMins: z.penaltyMins,
      poly: polygon(geoJson.coordinates),
    };
  });
  lastZonesFetch = now;
  return cachedRestrictedZones;
}

export async function handleLocationUpdate(
  io: Server,
  teamId: number,
  lat: number,
  lng: number,
) {
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
  // This reduces SQLite writes by 80-90% during active gameplay
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

  for (const zone of restrictedZones) {
    if (booleanPointInPolygon(pt, zone.poly)) {
      currentZones.add(zone.id);
      if (!prevZones.has(zone.id)) {
        await prisma.penalty.create({
          data: { teamId, kind: 'zone', minutes: zone.penaltyMins, appliedAt: new Date() },
        });
        io.to(`team:${teamId}`).emit('zone:entered', {
          zoneId: zone.id,
          label: zone.label,
          penaltyMins: zone.penaltyMins,
        });
      }
    }
  }

  teamZoneState.set(teamId, currentZones);
}
