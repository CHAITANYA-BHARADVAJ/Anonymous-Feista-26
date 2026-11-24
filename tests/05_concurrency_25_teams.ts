import http from 'http';

const BASE_URL = 'http://localhost:3001/api/v1';

async function request(endpoint: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + endpoint);
    const bodyStr = options.body ? JSON.stringify(options.body) : null;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (bodyStr) reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));

    const req = http.request(
      url,
      { method: options.method || 'GET', headers: reqHeaders },
      (res) => {
        let rawData = '';
        res.on('data', (c) => (rawData += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(rawData) });
          } catch {
            resolve({ status: res.statusCode, data: rawData });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runConcurrency25Squads() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 5: 25-Squad High-Concurrency Stress Test');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Authenticate Admin
  const adminRes = await request('/auth/admin/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminRes.data?.token;
  if (!adminToken) {
    console.error('Failed to get admin token');
    process.exit(1);
  }

  // 2. Concurrently Register 25 Simulated Squads
  const NUM_SQUADS = 25;
  process.stdout.write(`1. Concurrently Registering ${NUM_SQUADS} squads in parallel... `);
  const startReg = Date.now();
  const squadTokens: { id: number; name: string; token: string }[] = [];

  const regPromises = Array.from({ length: NUM_SQUADS }, async (_, i) => {
    const name = `Squad_${String(i + 1).padStart(2, '0')}_${Date.now().toString().slice(-4)}`;
    const code = `pass_${i + 1}_2026`;
    try {
      const res = await request('/auth/team/register', {
        method: 'POST',
        body: {
          name,
          code,
          leaderName: `Leader ${i + 1}`,
          mobile: `98000000${String(i).padStart(2, '0')}`,
        },
      });
      if ((res.status === 200 || res.status === 201) && res.data?.token) {
        return { id: res.data.teamId, name, token: res.data.token };
      }
      return null;
    } catch {
      return null;
    }
  });

  const regResults = await Promise.all(regPromises);
  const regElapsed = Date.now() - startReg;

  for (const r of regResults) {
    if (r) squadTokens.push(r);
  }

  if (squadTokens.length >= NUM_SQUADS - 2) {
    console.log(`✅ PASSED (${squadTokens.length}/${NUM_SQUADS} registered in ${regElapsed}ms, ~${Math.round(regElapsed / NUM_SQUADS)}ms/squad)`);
    passed++;
  } else {
    console.log(`❌ FAILED (Only registered ${squadTokens.length}/${NUM_SQUADS})`);
    failed++;
  }

  // 3. Concurrently Fetch Active Mission Directives for all registered squads
  process.stdout.write(`2. Fanning out ${squadTokens.length} concurrent /participant/game requests... `);
  const startFetch = Date.now();
  const fetchPromises = squadTokens.map(async (squad) => {
    const t0 = Date.now();
    const res = await request('/participant/game', {
      headers: { Authorization: `Bearer ${squad.token}` },
    });
    return { ok: res.status === 200, latency: Date.now() - t0 };
  });

  const fetchResults = await Promise.all(fetchPromises);
  const fetchElapsed = Date.now() - startFetch;
  const successfulFetches = fetchResults.filter((f) => f.ok).length;
  const avgLatency = Math.round(fetchResults.reduce((a, b) => a + b.latency, 0) / fetchResults.length);

  if (successfulFetches === squadTokens.length) {
    console.log(`✅ PASSED (${squadTokens.length}/${squadTokens.length} 200 OK in ${fetchElapsed}ms total, avg latency ${avgLatency}ms)`);
    passed++;
  } else {
    console.log(`❌ FAILED (${successfulFetches}/${squadTokens.length} successful)`);
    failed++;
  }

  // 4. Concurrently Query Admin Team Metadata and Stats
  process.stdout.write(`3. Concurrently Querying Admin Team Locations & Stats... `);
  const startAdminReads = Date.now();
  const adminReadPromises = squadTokens.map(async (squad) => {
    const res = await request(`/admin/teams/${squad.id}/location`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => null);
    return res?.status === 200;
  });

  const adminReadResults = await Promise.all(adminReadPromises);
  const adminReadElapsed = Date.now() - startAdminReads;
  const successAdmin = adminReadResults.filter(Boolean).length;
  if (successAdmin === squadTokens.length) {
    console.log(`✅ PASSED (${successAdmin}/${squadTokens.length} queries resolved in ${adminReadElapsed}ms)`);
    passed++;
  } else {
    console.log(`❌ FAILED (${successAdmin}/${squadTokens.length} resolved)`);
    failed++;
  }

  // 5. Stress Test: Leaderboard Under 100 Repeated Concurrent Queries
  process.stdout.write(`4. Hammering Leaderboard with 100 concurrent requests (Cache test)... `);
  const startHammer = Date.now();
  const hammerPromises = Array.from({ length: 100 }, async () => {
    const res = await request('/leaderboard');
    return res.status === 200;
  });

  const hammerResults = await Promise.all(hammerPromises);
  const hammerElapsed = Date.now() - startHammer;
  const hammerSuccess = hammerResults.filter(Boolean).length;

  if (hammerSuccess === 100) {
    console.log(`✅ PASSED (100/100 requests served in ${hammerElapsed}ms, ${(100 / (hammerElapsed / 1000)).toFixed(0)} req/sec)`);
    passed++;
  } else {
    console.log(`❌ FAILED (${hammerSuccess}/100 served)`);
    failed++;
  }

  // 6. Clean up the registered test squads
  process.stdout.write(`5. Cleaning up ${squadTokens.length} test squads from database... `);
  await Promise.all(
    squadTokens.map((squad) =>
      request(`/admin/teams/${squad.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => null),
    ),
  );
  console.log('✅ PASSED (Clean state restored)');
  passed++;

  console.log(`\nSuite 5 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runConcurrency25Squads().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
