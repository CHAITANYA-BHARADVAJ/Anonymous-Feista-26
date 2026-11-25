import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { FIESTA_2026_PACK } from '../src/data/fiesta2026Pack';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const game = await prisma.game.upsert({
    where: { id: 1 },
    update: {
      name: 'Campus Hunt 2026 - SDMCET',
    },
    create: {
      id: 1,
      name: 'Campus Hunt 2026 - SDMCET',
      status: 'idle',
      campusMapBounds: JSON.stringify([[15.4230, 75.0080], [15.4345, 75.0210]]),
    },
  });

  // Clear existing zones before seeding
  await prisma.mapZone.deleteMany({ where: { gameId: game.id } });

  // Create zones around SDMCET campus (Dharwad, Karnataka)
  await prisma.mapZone.createMany({
    data: [
      {
        gameId: game.id,
        kind: 'play',
        label: 'SDMCET Campus Boundary',
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [75.0122669, 15.4311411],
              [75.0134151, 15.4294168],
              [75.0141991, 15.4268949],
              [75.0143012, 15.4261208],
              [75.0155108, 15.4261632],
              [75.0161173, 15.4278694],
              [75.0169181, 15.4304989],
              [75.0146484, 15.4314469],
              [75.0132356, 15.4320346],
              [75.0122669, 15.4311411],
            ],
          ],
        }),
        active: true,
      },
      {
        gameId: game.id,
        kind: 'restricted',
        label: 'Substation & Electrical Yard',
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [75.0315, 15.4370],
              [75.0325, 15.4370],
              [75.0325, 15.4378],
              [75.0315, 15.4378],
              [75.0315, 15.4370],
            ],
          ],
        }),
        penaltyMins: 5,
        active: true,
      },
    ],
  });

  // Seed official Fiesta 2026 13-Clue Pool + Sports Complex Final Location when empty
  const existingLevelsCount = await prisma.level.count({ where: { gameId: game.id } });
  if (existingLevelsCount === 0) {
    for (const item of FIESTA_2026_PACK) {
      await prisma.level.create({
        data: {
          gameId: game.id,
          orderIndex: item.orderIndex,
          title: item.title,
          clueText: item.clueText,
          locationHint: item.locationHint,
          answer: item.answer,
          targetLat: item.targetLat,
          targetLng: item.targetLng,
          triggerRadiusMeters: item.triggerRadiusMeters,
          isFinal: item.isFinal,
          socialLinks: { create: item.socialLinks },
          hints: {
            create: item.hints.map((h, idx) => ({
              orderIndex: idx + 1,
              text: h.text,
              penaltyMins: h.penaltyMins,
            })),
          },
        },
      });
    }
  }

  // Create default demo teams
  const hash1 = await bcrypt.hash('hunt2026', 10);
  const hash2 = await bcrypt.hash('fiesta26', 10);

  await prisma.team.upsert({
    where: { name: 'Team Alpha' },
    update: {},
    create: { name: 'Team Alpha', code: hash1 },
  });

  await prisma.team.upsert({
    where: { name: 'Team Beta' },
    update: {},
    create: { name: 'Team Beta', code: hash2 },
  });

  console.log('Seed complete.');
  console.log('  Game: Campus Hunt 2026 - SDMCET (id=1)');
  console.log('  Levels seeded: 13 intermediate clues + 1 Sports Complex Final Location');
  console.log('  Teams: "Team Alpha" / code: hunt2026 | "Team Beta" / code: fiesta26');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
