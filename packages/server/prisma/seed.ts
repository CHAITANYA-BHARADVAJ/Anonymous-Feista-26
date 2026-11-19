import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin team (special team used for admin login — not a playing team)
  // Admin credentials come from .env; seed creates game + teams only.

  // Create the game
  const game = await prisma.game.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Campus Hunt 2026',
      status: 'idle',
    },
  });

  // Create zones
  await prisma.mapZone.createMany({
    data: [
      {
        gameId: game.id,
        kind: 'play',
        label: 'Main Campus',
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[77.59, 12.97], [77.60, 12.97], [77.60, 12.98], [77.59, 12.98], [77.59, 12.97]]],
        }),
        active: true,
      },
      {
        gameId: game.id,
        kind: 'restricted',
        label: 'Construction Zone',
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[77.591, 12.971], [77.592, 12.971], [77.592, 12.972], [77.591, 12.972], [77.591, 12.971]]],
        }),
        penaltyMins: 5,
        active: true,
      },
    ],
    skipDuplicates: true,
  });

  // Create levels
  const level1 = await prisma.level.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      gameId: game.id,
      orderIndex: 1,
      title: 'The Digital Footprint',
      clueText:
        'This person loves open-source contributions and has committed to a project about campus life. Their username is a play on the word "anonymous".',
      locationHint: 'Start near the main library entrance.',
      answer: 'anonymous',
      durationSecs: 1800,
      isFinal: false,
      socialLinks: {
        create: [
          { platform: 'github', url: 'https://github.com' },
          { platform: 'instagram', url: 'https://instagram.com' },
        ],
      },
      hints: {
        create: [
          { orderIndex: 1, text: 'Check the README files of campus-related repos.', penaltyMins: 2 },
          { orderIndex: 2, text: 'Their profile picture shows a coffee mug.', penaltyMins: 4 },
          { orderIndex: 3, text: 'Their username starts with "anon".', penaltyMins: 6 },
        ],
      },
    },
  });

  const level2 = await prisma.level.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      gameId: game.id,
      orderIndex: 2,
      title: 'The Social Trail',
      clueText:
        'Find someone who posted a photo at the campus canteen last Tuesday. Their Instagram bio mentions their department.',
      locationHint: 'Head towards the science block.',
      answer: 'canteen',
      durationSecs: 1200,
      isFinal: false,
      socialLinks: {
        create: [{ platform: 'instagram', url: 'https://instagram.com' }],
      },
      hints: {
        create: [
          { orderIndex: 1, text: 'Look for posts tagged with the college name.', penaltyMins: 2 },
          { orderIndex: 2, text: 'The department is Computer Science.', penaltyMins: 4 },
          { orderIndex: 3, text: 'Their last name starts with B.', penaltyMins: 6 },
        ],
      },
      checkpoints: {
        create: [
          {
            kind: 'question',
            questionText: 'What colour are the canteen chairs?',
            answer: 'blue',
            rewardKind: 'bonus_minutes',
            rewardValue: 2,
          },
        ],
      },
    },
  });

  await prisma.level.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      gameId: game.id,
      orderIndex: 3,
      title: 'Face to Face',
      clueText:
        'You have gathered enough clues. Find the target person and take a live photo together. Good luck!',
      locationHint: 'They were last seen near the amphitheatre.',
      answer: '',
      isFinal: true,
      hints: { create: [] },
    },
  });

  // Create teams
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
  console.log('  Game: Campus Hunt 2026 (id=1)');
  console.log('  Teams: "Team Alpha" / code: hunt2026 | "Team Beta" / code: fiesta26');
  console.log('  Admin: use ADMIN_USERNAME/ADMIN_PASSWORD from .env');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
