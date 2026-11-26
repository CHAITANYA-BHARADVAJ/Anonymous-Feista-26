import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing clean SDMCET Campus Hunt database...');

  const game = await prisma.game.upsert({
    where: { id: 1 },
    update: {
      name: 'Campus Hunt 2026 - SDMCET',
    },
    create: {
      id: 1,
      name: 'Campus Hunt 2026 - SDMCET',
      status: 'idle',
      registrationOpen: true,
      maxTeams: 25,
      campusMapBounds: JSON.stringify([[15.4230, 75.0080], [15.4345, 75.0210]]),
    },
  });

  // Seed default SDMCET campus boundary & restricted hazard zone only when no zones exist yet
  const existingZonesCount = await prisma.mapZone.count({ where: { gameId: game.id } });
  if (existingZonesCount === 0) {
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
  }

  console.log('Seed complete (clean slate: 0 pre-seeded clues, 0 pre-seeded teams).');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
