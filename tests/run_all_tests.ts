import { spawnSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestSuite {
  name: string;
  file: string;
}

const SUITES: TestSuite[] = [
  { name: 'Suite 1: Static Analysis, Types & DB Integrity', file: 'tests/01_static_and_db.ts' },
  { name: 'Suite 2: REST API Full Coverage & Security Matrix', file: 'tests/02_api_and_security.ts' },
  { name: 'Suite 3: Participant Field Gameplay Flow', file: 'tests/03_gameplay_flow.ts' },
  { name: 'Suite 4: Real-Time WebSocket Telemetry & Events', file: 'tests/04_realtime_sockets.ts' },
  { name: 'Suite 5: 25-Squad High-Concurrency Stress Test', file: 'tests/05_concurrency_25_teams.ts' },
  { name: 'Suite 6: 26-Route Round-Robin & Stride Engine', file: 'tests/06_round_robin_26_routes.ts' },
];

async function purgeTestSquads() {
  try {
    const testTeams = await prisma.team.findMany({
      where: {
        OR: [
          { name: { startsWith: 'Squad_' } },
          { name: { startsWith: 'Test Squad' } },
          { name: { startsWith: 'FlowSquad' } },
          { name: { startsWith: 'SocketSquad' } },
        ],
      },
    });

    for (const t of testTeams) {
      const teamId = t.id;
      await prisma.teamSession.deleteMany({ where: { teamId } });
      await prisma.teamPath.deleteMany({ where: { teamId } });
      const progIds = (await prisma.teamLevelProgress.findMany({ where: { teamId }, select: { id: true } })).map((p) => p.id);
      await prisma.hintReveal.deleteMany({ where: { progressId: { in: progIds } } });
      await prisma.teamLevelProgress.deleteMany({ where: { teamId } });
      await prisma.teamLocation.deleteMany({ where: { teamId } });
      await prisma.sosAlert.deleteMany({ where: { teamId } });
      await prisma.penalty.deleteMany({ where: { teamId } });
      await prisma.teamCheckpoint.deleteMany({ where: { teamId } });
      await prisma.photo.deleteMany({ where: { teamId } });
      await prisma.team.delete({ where: { id: teamId } });
    }

    // Reset game capacity and status
    const game = await prisma.game.findFirst({ orderBy: { id: 'desc' } });
    if (game) {
      await prisma.game.update({
        where: { id: game.id },
        data: { maxTeams: 50, registrationOpen: true, status: 'idle' },
      });
    }
  } catch {}
}

async function runMasterTestHarness() {
  console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║       CAMPUS HUNT SDMCET (Anonymous-Feista-26) — MASTER TEST SUITE      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝');

  // Pre-flight database sanitization
  await purgeTestSquads();

  const startAll = Date.now();
  let totalSuitesPassed = 0;
  let totalSuitesFailed = 0;

  for (const suite of SUITES) {
    const suiteStart = Date.now();
    const result = spawnSync(`npx tsx ${suite.file}`, {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    const elapsed = ((Date.now() - suiteStart) / 1000).toFixed(2);

    if (result.status === 0) {
      totalSuitesPassed++;
      console.log(`>>> ${suite.name}: PASSED (${elapsed}s)\n`);
    } else {
      totalSuitesFailed++;
      console.log(`>>> ${suite.name}: FAILED with exit code ${result.status} (${elapsed}s)\n`);
    }
  }

  // Post-flight database sanitization
  await purgeTestSquads();
  await prisma.$disconnect();

  const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(2);

  console.log('=========================================================================');
  console.log('🏁 MASTER TEST EXECUTION REPORT');
  console.log('=========================================================================');
  console.log(`Total Test Suites Executed: ${SUITES.length}`);
  console.log(`Suites Passed:              ${totalSuitesPassed}`);
  console.log(`Suites Failed:              ${totalSuitesFailed}`);
  console.log(`Total Duration:             ${totalElapsed}s`);
  console.log('=========================================================================\n');

  if (totalSuitesFailed > 0) {
    process.exit(1);
  }
}

runMasterTestHarness();
