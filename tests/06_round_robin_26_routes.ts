import assert from 'assert';
import {
  buildRoundRobinSequence,
  DEFAULT_INTERMEDIATE_STEPS,
  selectRoundRobinStride,
} from '../packages/server/src/services/dispatchService';
import { FIESTA_2026_PACK } from '../packages/server/src/data/fiesta2026Pack';

function runRoundRobin26RouteTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 6: 26-Route Round-Robin & Stride Engine');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Validate Fiesta 2026 Pack Structure (13 intermediate + 1 Final)
  try {
    process.stdout.write('1. Verifying Fiesta 2026 Pack (13 clues + 1 Final Location)... ');
    const intermediate = FIESTA_2026_PACK.filter((c) => !c.isFinal);
    const finals = FIESTA_2026_PACK.filter((c) => c.isFinal);
    assert.strictEqual(FIESTA_2026_PACK.length, 14, 'Expected 14 total stages');
    assert.strictEqual(intermediate.length, 13, 'Expected 13 intermediate clues');
    assert.strictEqual(finals.length, 1, 'Expected 1 Final Location');
    assert.strictEqual(finals[0].answer, 'chacha wastegan huyyiyaa!');
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 2. Simulate 26 Teams on the 13-Clue Pool
  const intermediatePool = FIESTA_2026_PACK.filter((c) => !c.isFinal);
  const routes = Array.from({ length: 26 }, (_, idx) =>
    buildRoundRobinSequence(intermediatePool, idx, DEFAULT_INTERMEDIATE_STEPS),
  );

  try {
    process.stdout.write('2. Verifying 26 unique 10-clue routes (zero duplicates, zero twins)... ');
    const serialized = new Set<string>();
    for (let t = 0; t < routes.length; t++) {
      const route = routes[t];
      assert.strictEqual(route.length, 10, `Team ${t + 1} should have 10 intermediate clues`);
      const distinct = new Set(route.map((r) => r.orderIndex));
      assert.strictEqual(distinct.size, 10, `Team ${t + 1} has repeated clues`);
      serialized.add(route.map((r) => r.orderIndex).join('->'));
    }
    assert.strictEqual(serialized.size, 26, 'All 26 team routes must be unique');
    console.log('✅ PASSED (26/26 unique routes)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 3. Verify Exact 2 Teams Per Landmark at Every Stage (Steps 1..10)
  try {
    process.stdout.write('3. Verifying max 2 teams per landmark across all 10 steps... ');
    for (let step = 0; step < 10; step++) {
      const counts = new Map<number, number>();
      for (const route of routes) {
        const ord = route[step].orderIndex;
        counts.set(ord, (counts.get(ord) ?? 0) + 1);
      }
      assert.strictEqual(counts.size, 13, `Step ${step + 1} must cover all 13 landmarks`);
      for (const [ord, count] of counts.entries()) {
        assert.strictEqual(count, 2, `Step ${step + 1} landmark ${ord} had ${count} teams (expected 2)`);
      }
    }
    console.log('✅ PASSED (Exactly 2 teams/landmark at all 10 steps)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 4. Verify Zero Shared Transitions Between Odd (+1) and Even (+5) Teams
  try {
    process.stdout.write('4. Verifying zero shared transitions between +1 and +5 cohorts... ');
    const oddEdges = new Set<string>();
    const evenEdges = new Set<string>();
    for (let t = 0; t < 26; t++) {
      const r = routes[t];
      const target = t % 2 === 0 ? oddEdges : evenEdges;
      for (let k = 0; k < r.length - 1; k++) {
        target.add(`${r[k].orderIndex}->${r[k + 1].orderIndex}`);
      }
    }
    for (const edge of oddEdges) {
      assert.ok(!evenEdges.has(edge), `Transition ${edge} appeared in both +1 and +5 cohorts`);
    }
    // Verify Team 01 (+1 from C01) and Team 02 (+5 from C02) exact expected starts & second steps
    assert.strictEqual(routes[0][0].orderIndex, 1);
    assert.strictEqual(routes[0][1].orderIndex, 2);
    assert.strictEqual(routes[1][0].orderIndex, 2);
    assert.strictEqual(routes[1][1].orderIndex, 7);
    assert.strictEqual(routes[13][0].orderIndex, 1);
    assert.strictEqual(routes[13][1].orderIndex, 6);
    console.log('✅ PASSED (0 cross-cohort edge overlaps)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 5. Verify Coprime Stride Fallback for Non-Prime Pool Lengths (10, 15, 25, 2, 1)
  try {
    process.stdout.write('5. Verifying coprime stride safety for pool sizes 1, 2, 10, 15, 25... ');
    for (const len of [1, 2, 10, 15, 25]) {
      const mockPool = Array.from({ length: len }, (_, i) => ({ orderIndex: i + 1 }));
      for (let idx = 0; idx < 26; idx++) {
        const stride = selectRoundRobinStride(idx, len);
        assert.ok(stride >= 1, 'Stride must be positive');
        const seq = buildRoundRobinSequence(mockPool, idx, DEFAULT_INTERMEDIATE_STEPS);
        const expectedLen = Math.min(DEFAULT_INTERMEDIATE_STEPS, len);
        assert.strictEqual(seq.length, expectedLen, `Pool ${len} team ${idx} length mismatch`);
        assert.strictEqual(
          new Set(seq.map((s) => s.orderIndex)).size,
          expectedLen,
          `Pool ${len} team ${idx} had duplicate levels with stride ${stride}`,
        );
      }
    }
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  console.log(`\nSuite 6 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runRoundRobin26RouteTests();
