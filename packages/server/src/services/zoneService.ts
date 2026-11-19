import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { prisma } from '../lib/prisma';
import { Server } from 'socket.io';

// In-memory: last known zone membership per team
const teamZoneState = new Map<number, Set<number>>(); // teamId → Set<zoneId>

export async function handleLocationUpdate(
  io: Server,
  teamId: number,
  lat: number,
  lng: number,
) {
  // Store location
  await prisma.teamLocation.create({ data: { teamId, lat, lng, recordedAt: new Date() } });

  // Broadcast to admin
  io.to('admin').emit('admin:team_location', { teamId, lat, lng, recordedAt: new Date() });

  // Check restricted zones
  const zones = await prisma.mapZone.findMany({
    where: { kind: 'restricted', active: true },
  });

  const prevZones = teamZoneState.get(teamId) ?? new Set<number>();
  const currentZones = new Set<number>();

  const pt = point([lng, lat]);

  for (const zone of zones) {
    const geoJson = JSON.parse(zone.geoJson);
    const poly = polygon(geoJson.coordinates);
    if (booleanPointInPolygon(pt, poly)) {
      currentZones.add(zone.id);
      // New entry
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
