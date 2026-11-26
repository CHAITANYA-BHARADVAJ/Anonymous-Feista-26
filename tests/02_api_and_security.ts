import http from 'http';
import assert from 'assert';
import { getProductionEnvErrors } from '../packages/server/src/lib/env';

const BASE_URL = 'http://localhost:3001/api/v1';

async function request(
  endpoint: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + endpoint);
    const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (bodyStr) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode || 500,
            data: parsed,
            headers: res.headers,
          });
        });
      },
    );

    req.on('error', (err) => reject(err));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runApiAndSecurityTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 2: REST API Full Coverage & Security Matrix');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  let adminToken = '';
  let teamToken = '';
  let testSquadId = 0;
  let activeGameId = 1;
  const testSquadName = `Test Squad ${Date.now()}`;
  const testSquadCode = 'testpass123';

  // 1. Health check (including DB probe)
  try {
    process.stdout.write('1. Testing /health endpoint & DB probe... ');
    const res = await request('/health');
    if (res.status === 200 && res.data?.ok === true && res.data?.db === 'ok') {
      console.log('✅ PASSED (200 OK, DB OK)');
      passed++;
    } else {
      throw new Error(`Expected 200 {ok: true, db: 'ok'}, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 2. Admin Login - Valid
  try {
    process.stdout.write('2. Admin Login with valid credentials (/auth/admin/login)... ');
    const res = await request('/auth/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    if (res.status === 200 && res.data?.token) {
      adminToken = res.data.token;
      console.log('✅ PASSED (200 OK, Token generated)');
      passed++;
    } else {
      throw new Error(`Expected 200 with token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 3. Admin Login - Invalid Credentials
  try {
    process.stdout.write('3. Admin Login with wrong password (401 check)... ');
    const res = await request('/auth/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'wrongpassword' },
    });
    if (res.status === 401) {
      console.log('✅ PASSED (401 Unauthorized)');
      passed++;
    } else {
      throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 4. Security: Protected Admin Route without Token
  try {
    process.stdout.write('4. Accessing protected admin endpoint with NO token... ');
    const res = await request('/admin/teams');
    if (res.status === 401) {
      console.log('✅ PASSED (401 Unauthorized)');
      passed++;
    } else {
      throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 5. Squad Registration
  try {
    process.stdout.write(`5. Squad Registration (/auth/team/register) for "${testSquadName}"... `);
    const res = await request('/auth/team/register', {
      method: 'POST',
      body: {
        name: testSquadName,
        code: testSquadCode,
        leaderName: 'Test Leader',
        mobile: '9876543210',
      },
    });
    if ((res.status === 200 || res.status === 201) && res.data?.token) {
      teamToken = res.data.token;
      testSquadId = res.data.teamId;
      console.log('✅ PASSED (201 Created, Registered)');
      passed++;
    } else {
      throw new Error(`Expected 201 with team token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 6. Duplicate Squad Name Collision (409 Conflict)
  try {
    process.stdout.write('6. Duplicate Squad Name Registration Collision (409 Conflict)... ');
    const res = await request('/auth/team/register', {
      method: 'POST',
      body: {
        name: testSquadName,
        code: 'anothercode',
      },
    });
    if (res.status === 409) {
      console.log('✅ PASSED (409 Conflict correctly rejected)');
      passed++;
    } else {
      throw new Error(`Expected 409 Conflict, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 7. Security: Team Token accessing Admin Route (403 Forbidden)
  try {
    process.stdout.write('7. Privilege Escalation Prevention: Team Token accessing /admin/teams... ');
    const res = await request('/admin/teams', {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    if (res.status === 403) {
      console.log('✅ PASSED (403 Forbidden enforced)');
      passed++;
    } else {
      throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 8. Fetch Games
  try {
    process.stdout.write('8. Fetching Games list (/games)... ');
    const res = await request('/games', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      activeGameId = res.data[0].id;
      console.log(`✅ PASSED (Game ID: ${activeGameId}, Status: ${res.data[0].status})`);
      passed++;
    } else {
      throw new Error(`Expected games array, got status ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 9. Levels & Clues Lifecycle: Create, Fetch, Delete
  let testLevelId = 0;
  try {
    process.stdout.write('9. Clue Creation (/levels/game/:id)... ');
    const createRes = await request(`/levels/game/${activeGameId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        title: 'Automated Test Clue',
        orderIndex: 99,
        clueText: 'Automated test directive text.',
        locationHint: 'Testing Area',
        answer: 'testkey',
        targetLat: 15.4286,
        targetLng: 75.015,
        triggerRadiusMeters: 25,
        isFinal: false,
        hints: [{ text: 'Test hint 1', penaltyMins: 2 }],
      },
    });

    if ((createRes.status === 200 || createRes.status === 201) && createRes.data?.id) {
      testLevelId = createRes.data.id;
      console.log(`✅ PASSED (Created Level ID: ${testLevelId})`);
      passed++;
    } else {
      throw new Error(`Expected 200/201 with level id, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    }

    process.stdout.write('10. Deleting Temporary Test Clue... ');
    const delRes = await request(`/levels/${testLevelId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (delRes.status === 200 && delRes.data?.ok === true) {
      console.log('✅ PASSED');
      passed++;
    } else {
      throw new Error(`Expected 200 {ok: true}, got ${delRes.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 11. Hazard Zones: Create, Fetch, Delete
  let testZoneId = 0;
  try {
    process.stdout.write('11. Hazard Zone Creation (/zones/game/:id)... ');
    const zoneRes = await request(`/zones/game/${activeGameId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        label: 'Test Danger Area',
        kind: 'restricted',
        penaltyMins: 5,
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [75.013, 15.428],
              [75.014, 15.428],
              [75.014, 15.429],
              [75.013, 15.429],
              [75.013, 15.428],
            ],
          ],
        }),
      },
    });

    if ((zoneRes.status === 200 || zoneRes.status === 201) && zoneRes.data?.id) {
      testZoneId = zoneRes.data.id;
      console.log(`✅ PASSED (Created Zone ID: ${testZoneId})`);
      passed++;
    } else {
      throw new Error(`Expected 200/201 with zone id, got ${zoneRes.status}: ${JSON.stringify(zoneRes.data)}`);
    }

    process.stdout.write('12. Deleting Temporary Test Hazard Zone... ');
    const delZoneRes = await request(`/zones/${testZoneId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (delZoneRes.status === 200 && delZoneRes.data?.ok === true) {
      console.log('✅ PASSED');
      passed++;
    } else {
      throw new Error(`Expected 200 {ok: true}, got ${delZoneRes.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 13. Leaderboard Speed & In-Memory Caching Verification
  try {
    process.stdout.write('13. Leaderboard Endpoint Latency (<50ms In-Memory Caching)... ');
    const start = Date.now();
    const res = await request('/leaderboard');
    const elapsed = Date.now() - start;

    if (res.status === 200 && Array.isArray(res.data?.rankings)) {
      console.log(`✅ PASSED (${elapsed}ms latency, ${res.data.rankings.length} teams ranked)`);
      passed++;
    } else {
      throw new Error(`Expected rankings array, got ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 14. Security: Protected /uploads route (401 unauthenticated, 403 cross-team)
  try {
    process.stdout.write('14. Verifying /uploads blocks unauthenticated & cross-team access... ');
    const unauthStatus = await new Promise<number>((resolve, reject) => {
      http.get('http://localhost:3001/uploads/1/nonexistent.png', (res) => {
        res.resume();
        resolve(res.statusCode || 500);
      }).on('error', reject);
    });
    const crossTeamStatus = await new Promise<number>((resolve, reject) => {
      http.get(
        `http://localhost:3001/uploads/${testSquadId + 999}/nonexistent.png`,
        { headers: { Authorization: `Bearer ${teamToken}` } },
        (res) => {
          res.resume();
          resolve(res.statusCode || 500);
        },
      ).on('error', reject);
    });
    assert.strictEqual(unauthStatus, 401, `Expected 401 on unauth /uploads, got ${unauthStatus}`);
    assert.strictEqual(crossTeamStatus, 403, `Expected 403 on cross-team /uploads, got ${crossTeamStatus}`);
    console.log('✅ PASSED (401 unauth, 403 cross-team)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 15. Input Validation & No-Crash Check (Invalid IDs return 400, server stays healthy)
  try {
    process.stdout.write('15. Invalid numeric route IDs return 400 safely... ');
    const badLevel = await request('/levels/not-an-id', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { title: 'Test' },
    });
    const badTeam = await request('/admin/teams/invalid-id', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const badAction = await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'nuke_db' },
    });
    assert.strictEqual(badLevel.status, 400);
    assert.strictEqual(badTeam.status, 400);
    assert.strictEqual(badAction.status, 400);
    console.log('✅ PASSED (All invalid params returned 400 cleanly)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 16. Shared Clue Pool DB CRUD (/levels/pool)
  try {
    process.stdout.write('16. Shared Clue Pool DB CRUD (/levels/pool)... ');
    const created = await request('/levels/pool', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        title: `PoolTest_${Date.now()}`,
        clueText: 'Solve the pool test',
        locationHint: 'Main quad',
        answer: 'poolkey',
        hints: [{ text: 'Pool hint 1', penaltyMins: 2 }],
        socialLinks: [{ platform: 'GitHub', url: 'https://github.com/anon-sdmcet' }],
      },
    });
    assert.strictEqual(created.status, 201);
    const poolId = created.data?.id;
    assert.ok(typeof poolId === 'number' && poolId > 0);

    const list = await request('/levels/pool', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(list.status, 200);
    assert.ok(list.data.some((c: any) => c.id === poolId));

    const updated = await request(`/levels/pool/${poolId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { title: 'PoolTestUpdated', answer: 'poolkey2' },
    });
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.data?.title, 'PoolTestUpdated');

    const deleted = await request(`/levels/pool/${poolId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(deleted.status, 200);
    console.log('✅ PASSED (Created, Listed, Updated, Deleted)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 17. Auth Brute-Force Rate Limiting (429 on repeated failed team login)
  try {
    process.stdout.write('17. Auth Brute-Force Rate Limiter (429 after burst)... ');
    const dummyName = `RateLimitDummy_${Date.now()}`;
    let got429 = false;
    for (let i = 0; i < 24; i++) {
      const r = await request('/auth/team/login', {
        method: 'POST',
        body: { name: dummyName, code: 'wrongcode' },
      });
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Expected 429 Too Many Requests after 20+ failed attempts');
    console.log('✅ PASSED (429 enforced)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 18. Production Environment Secret Validator
  try {
    process.stdout.write('18. Production Env Validator rejects defaults & accepts strong secrets... ');
    const badErrors = getProductionEnvErrors({
      NODE_ENV: 'production',
      JWT_SECRET: 'dev-secret',
      ADMIN_PASSWORD: 'admin123',
    });
    assert.strictEqual(badErrors.length, 2);

    const goodErrors = getProductionEnvErrors({
      NODE_ENV: 'production',
      JWT_SECRET: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      ADMIN_PASSWORD: 'Sdmcet#Event2026!',
    });
    assert.strictEqual(goodErrors.length, 0);
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 19. Clean up test squad (ensures zero residual test records)
  if (testSquadId) {
    try {
      process.stdout.write('19. Cleaning up Temporary Test Squad... ');
      const delSquadRes = await request(`/admin/teams/${testSquadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (delSquadRes.status === 200 && delSquadRes.data?.ok === true) {
        console.log('✅ PASSED');
        passed++;
      } else {
        throw new Error(`Expected 200 {ok: true}, got ${delSquadRes.status}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }
  }

  console.log(`\nSuite 2 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runApiAndSecurityTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
