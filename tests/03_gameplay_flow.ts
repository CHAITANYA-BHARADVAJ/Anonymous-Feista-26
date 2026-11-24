import http from 'http';

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

async function runGameplayFlowTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 3: Participant Field Gameplay Flow');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  let adminToken = '';
  let teamToken = '';
  let activeGameId = 1;
  const teamName = `FlowSquad_${Date.now()}`;
  const teamCode = 'flow2026';

  // 1. Authenticate Admin
  try {
    process.stdout.write('1. Authenticating Admin... ');
    const res = await request('/auth/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    if (res.status === 200 && res.data?.token) {
      adminToken = res.data.token;
      console.log('✅ PASSED');
      passed++;
    } else {
      throw new Error(`Admin auth failed: ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 2. Fetch Active Game & Ensure Levels Exist
  try {
    process.stdout.write('2. Querying Active Game State & Clues... ');
    const res = await request('/games', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (res.status === 200 && res.data?.[0]) {
      activeGameId = res.data[0].id;

      // Check if levels exist; if not, generate default pack
      const levelsRes = await request(`/levels/game/${activeGameId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!Array.isArray(levelsRes.data) || levelsRes.data.length === 0) {
        await request(`/levels/game/${activeGameId}/generate-25-pack`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      }
      console.log(`✅ PASSED (Active Game ID: ${activeGameId})`);
      passed++;
    } else {
      throw new Error('Failed to fetch game state');
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 3. Register Test Squad
  let squadTeamId = 0;
  try {
    process.stdout.write(`3. Enrolling Test Squad "${teamName}"... `);
    const res = await request('/auth/team/register', {
      method: 'POST',
      body: {
        name: teamName,
        code: teamCode,
        leaderName: 'Flow Leader',
        mobile: '9999988888',
      },
    });
    if ((res.status === 200 || res.status === 201) && res.data?.token) {
      teamToken = res.data.token;
      squadTeamId = res.data.teamId;
      console.log(`✅ PASSED (Team ID: ${squadTeamId})`);
      passed++;
    } else {
      throw new Error(`Registration failed: ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 4. Set Game to 'running' for Field Actions
  try {
    process.stdout.write('4. Transitioning Event to RUNNING status... ');
    const res = await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'start' },
    });
    if (res.status === 200) {
      console.log('✅ PASSED (Hunt status: RUNNING)');
      passed++;
    } else {
      throw new Error(`Status transition failed: ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 5. Participant Queries Current Game & Active Clue
  let currentLevel: any = null;
  try {
    process.stdout.write('5. Participant fetching active mission (/participant/game)... ');
    const res = await request('/participant/game', {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    if (res.status === 200 && res.data?.game) {
      const progress = res.data.progress || [];
      const activeProg = progress.find((p: any) => !p.completedAt) || progress[0];
      currentLevel = activeProg?.level;
      console.log(`✅ PASSED (Active Stage: "${currentLevel?.title || 'None'}", Level ID: ${currentLevel?.id})`);
      passed++;
    } else {
      throw new Error(`Failed to fetch participant game state: ${res.status}`);
    }
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 6. Proximity Radar: Distance Verification Outside Radius
  if (currentLevel) {
    try {
      process.stdout.write('6. Testing Proximity Check when 500m OUTSIDE radius (400 check)... ');
      const res = await request(`/participant/levels/${currentLevel.id}/reach-location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: {
          lat: 15.4200, // distant from campus
          lng: 75.0050,
        },
      });

      if (res.status === 400 && res.data?.error?.includes('away')) {
        console.log(`✅ PASSED (Correctly rejected: ${res.data.error})`);
        passed++;
      } else {
        throw new Error(`Expected 400 distance rejection, got ${res.status}: ${JSON.stringify(res.data)}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }

    // 7. Proximity Radar: Distance Verification Inside Radius (Unlocks Clue)
    try {
      process.stdout.write('7. Testing Proximity Check when INSIDE radius (Clue Drop)... ');
      const targetLat = currentLevel.targetLat ?? 15.4294;
      const targetLng = currentLevel.targetLng ?? 75.0135;

      const res = await request(`/participant/levels/${currentLevel.id}/reach-location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: {
          lat: targetLat,
          lng: targetLng,
        },
      });

      if (res.status === 200 && res.data?.reached === true) {
        console.log('✅ PASSED (Clue unlocked successfully)');
        passed++;
      } else {
        throw new Error(`Expected 200 {reached: true}, got ${res.status}: ${JSON.stringify(res.data)}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }

    // 8. Submit Answer - Wrong Passcode (422)
    try {
      process.stdout.write('8. Submitting INCORRECT answer (422 check)... ');
      const res = await request(`/participant/levels/${currentLevel.id}/answer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: { answer: 'definitelywronganswer999' },
      });

      if (res.status === 422) {
        console.log('✅ PASSED (422 Incorrect answer rejected)');
        passed++;
      } else {
        throw new Error(`Expected 422, got ${res.status}: ${JSON.stringify(res.data)}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }

    // 9. Hint Reveal and Penalty Increment
    if (currentLevel.hints && currentLevel.hints.length > 0) {
      const hint = currentLevel.hints[0];
      try {
        process.stdout.write(`9. Revealing Hint #${hint.orderIndex} (+${hint.penaltyMins}m penalty)... `);
        const res = await request(`/participant/levels/${currentLevel.id}/hints/${hint.orderIndex}/reveal`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teamToken}` },
        });

        if (res.status === 200 && res.data?.text) {
          console.log(`✅ PASSED (Hint text: "${res.data.text}")`);
          passed++;
        } else {
          throw new Error(`Expected 200 with hint text, got ${res.status}: ${JSON.stringify(res.data)}`);
        }
      } catch (err: any) {
        console.log('❌ FAILED\n', err.message);
        failed++;
      }
    }
  }

  // 10. Admin Directives: Bypass GPS & Force Advance
  if (squadTeamId) {
    try {
      process.stdout.write('10. Admin Emergency Bypass GPS Override... ');
      const res = await request(`/admin/teams/${squadTeamId}/bypass-gps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 200 && res.data?.ok === true) {
        console.log('✅ PASSED (GPS successfully bypassed by admin)');
        passed++;
      } else {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }

    try {
      process.stdout.write('11. Admin Stage Jump Override (Jump to Stage 5)... ');
      const res = await request(`/admin/teams/${squadTeamId}/jump-stage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { targetStepNumber: 5 },
      });
      if (res.status === 200 && res.data?.ok === true) {
        console.log('✅ PASSED (Squad moved directly to Stage 5)');
        passed++;
      } else {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
      }
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }

    // Clean up test team
    try {
      await request(`/admin/teams/${squadTeamId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } catch {}
  }

  // Restore game status to idle
  try {
    await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'reset' },
    });
  } catch {}

  console.log(`\nSuite 3 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runGameplayFlowTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
