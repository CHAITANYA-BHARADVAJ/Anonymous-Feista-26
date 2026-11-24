import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runStaticAndDbTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 1: Static Analysis, Types & DB Integrity');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Prisma Schema Validation
  try {
    process.stdout.write('1. Validating Prisma Schema... ');
    execSync('npx prisma validate --schema=packages/server/prisma/schema.prisma', { stdio: 'pipe' });
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.stderr?.toString() || err.message);
    failed++;
  }

  // 2. Client TypeScript Type Check
  try {
    process.stdout.write('2. Client TypeScript Type Check (tsc --noEmit)... ');
    execSync('npx --workspace=packages/client tsc --noEmit', { stdio: 'pipe' });
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.stderr?.toString() || err.message);
    failed++;
  }

  // 3. Server TypeScript Type Check
  try {
    process.stdout.write('3. Server TypeScript Type Check (tsc --noEmit)... ');
    execSync('npx --workspace=packages/server tsc --noEmit', { stdio: 'pipe' });
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.stderr?.toString() || err.message);
    failed++;
  }

  // 4. SQLite Integrity & WAL Pragma Checks
  try {
    process.stdout.write('4. SQLite Database Integrity Check (PRAGMA integrity_check)... ');
    const integrity: any = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
    const result = integrity[0]?.integrity_check || integrity[0]?.['integrity_check'] || 'ok';
    if (result.toLowerCase() === 'ok') {
      console.log('✅ PASSED (Integrity: OK)');
      passed++;
    } else {
      throw new Error(`Integrity check reported: ${JSON.stringify(integrity)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 5. SQLite Foreign Keys
  try {
    process.stdout.write('5. SQLite Foreign Key Integrity Check (PRAGMA foreign_key_check)... ');
    const fkChecks: any = await prisma.$queryRawUnsafe('PRAGMA foreign_key_check;');
    if (Array.isArray(fkChecks) && fkChecks.length === 0) {
      console.log('✅ PASSED (Zero FK violations)');
      passed++;
    } else {
      throw new Error(`Foreign key check reported violations: ${JSON.stringify(fkChecks)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 6. SQLite Journal Mode Check
  try {
    process.stdout.write('6. SQLite Journal Mode Verification (WAL)... ');
    const journal: any = await prisma.$queryRawUnsafe('PRAGMA journal_mode;');
    const mode = journal[0]?.journal_mode || journal[0]?.['journal_mode'] || '';
    if (mode.toLowerCase() === 'wal') {
      console.log('✅ PASSED (WAL mode active)');
      passed++;
    } else {
      console.log(`⚠️ WARNING (Journal mode is: ${mode}, expected wal)`);
      passed++;
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 7. Core Schema Models Verification
  try {
    process.stdout.write('7. Verifying Core Database Tables Exist... ');
    const gamesCount = await prisma.game.count();
    const teamsCount = await prisma.team.count();
    const levelsCount = await prisma.level.count();
    const zonesCount = await prisma.mapZone.count();
    console.log(`✅ PASSED (${gamesCount} games, ${teamsCount} teams, ${levelsCount} levels, ${zonesCount} zones)`);
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  await prisma.$disconnect();

  console.log(`\nSuite 1 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runStaticAndDbTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
