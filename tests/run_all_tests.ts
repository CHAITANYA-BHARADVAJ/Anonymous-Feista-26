import { spawnSync } from 'child_process';
import path from 'path';

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
];

async function runMasterTestHarness() {
  console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║       CAMPUS HUNT SDMCET (Anonymous-Feista-26) — MASTER TEST SUITE      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝');

  const startAll = Date.now();
  let totalSuitesPassed = 0;
  let totalSuitesFailed = 0;

  for (const suite of SUITES) {
    const suiteStart = Date.now();
    const result = spawnSync('npx', ['tsx', suite.file], {
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
