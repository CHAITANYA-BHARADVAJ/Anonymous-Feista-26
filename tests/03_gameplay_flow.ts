import http from 'http';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { FIESTA_2026_PACK } from '../packages/server/src/data/fiesta2026Pack';

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

async function uploadDummyPhoto(token: string): Promise<{ status: number; data: any }> {
  // Valid 1x1 transparent PNG bytes
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const boundary = `----CampusHuntTestBoundary${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="victory.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([head, pngBytes, tail]);

  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/participant/photos`);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(payload.length),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runGameplayFlowTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 3: Participant Field Gameplay, Fog-of-War & Photo Sync');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  let adminToken = '';
  let teamToken = '';
  let activeGameId = 1;
  const teamName = `FlowSquad_${Date.now()}`;
  const teamCode = 'flow2026';

  const answerLookup = new Map<string, string>(
    FIESTA_2026_PACK.map((item) => [item.title.toLowerCase().trim(), item.answer]),
  );

  // 1. Authenticate Admin
  try {
    process.stdout.write('1. Authenticating Admin... ');
    const res = await request('/auth/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data?.token);
    adminToken = res.data.token;
    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 2. Fetch Active Game & Ensure Levels Exist (temporarily load if DB is empty, clean up afterward)
  let seededTempLevels = false;
  try {
    process.stdout.write('2. Querying Active Game State & Clues... ');
    const res = await request('/games', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data?.[0]);
    activeGameId = res.data[0].id;

    const levelsRes = await request(`/levels/game/${activeGameId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!Array.isArray(levelsRes.data) || levelsRes.data.length === 0) {
      seededTempLevels = true;
      await request(`/levels/game/${activeGameId}/generate-fiesta-pack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
    console.log(`✅ PASSED (Active Game ID: ${activeGameId})`);
    passed++;
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
    assert.ok(res.status === 200 || res.status === 201);
    teamToken = res.data.token;
    squadTeamId = res.data.teamId;
    console.log(`✅ PASSED (Team ID: ${squadTeamId})`);
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 4. Start Event
  try {
    process.stdout.write('4. Transitioning Event to RUNNING status... ');
    const res = await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'start' },
    });
    assert.strictEqual(res.status, 200);
    console.log('✅ PASSED (Hunt status: RUNNING)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 5. Fog-of-War Pre-Arrival Security Check
  let currentLevel: any = null;
  try {
    process.stdout.write('5. Fog-of-War: Verifying answer/clue/hints are stripped before GPS arrival... ');
    const res = await request('/participant/game', {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    assert.strictEqual(res.status, 200);
    const progress = res.data.progress || [];
    const activeProg = progress.find((p: any) => !p.completedAt) || progress[0];
    currentLevel = activeProg?.level;
    assert.ok(currentLevel, 'Expected unlocked Stage 1');
    assert.strictEqual((currentLevel as any).answer, undefined, 'Answer leaked in participant payload!');
    assert.strictEqual(currentLevel.clueLocked, true, 'Expected clueLocked: true before arrival');
    assert.strictEqual(currentLevel.clueText, '', 'Expected clueText masked before arrival');
    assert.strictEqual(currentLevel.hints.length, 0, 'Expected hints masked before arrival');

    const earlyAnswer = await request(`/participant/levels/${currentLevel.id}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teamToken}` },
      body: { answer: 'anything' },
    });
    assert.strictEqual(earlyAnswer.status, 403, 'Expected 403 blocking answer before GPS arrival');

    const earlyPhoto = await uploadDummyPhoto(teamToken);
    assert.strictEqual(earlyPhoto.status, 403, 'Expected 403 blocking victory photo before Finale');

    console.log('✅ PASSED (Zero leaks; early answer & photo blocked)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 6. Proximity Check Outside & Inside Radius + Hint Reload Persistence
  if (currentLevel) {
    try {
      process.stdout.write('6. Proximity Radar: Outside (400) -> Inside (200) -> Hint Reveal & Persistence... ');
      const farRes = await request(`/participant/levels/${currentLevel.id}/reach-location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: { lat: 15.42, lng: 75.005 },
      });
      assert.strictEqual(farRes.status, 400);

      const nearRes = await request(`/participant/levels/${currentLevel.id}/reach-location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: { lat: currentLevel.targetLat ?? 15.4294, lng: currentLevel.targetLng ?? 75.0135 },
      });
      assert.strictEqual(nearRes.status, 200);
      assert.strictEqual(nearRes.data?.reached, true);
      assert.ok(nearRes.data?.clueText?.length > 0);

      const afterReach = await request('/participant/game', {
        headers: { Authorization: `Bearer ${teamToken}` },
      });
      const progAfterReach = afterReach.data.progress.find((p: any) => p.levelId === currentLevel.id);
      assert.strictEqual(progAfterReach.freeHintsRemaining, 0);
      if (progAfterReach.level.hints.length > 0) {
        assert.strictEqual(progAfterReach.level.hints[0].text, undefined, 'Unrevealed hint text leaked!');
        const revealRes = await request(
          `/participant/levels/${currentLevel.id}/hints/${progAfterReach.level.hints[0].orderIndex}/reveal`,
          { method: 'POST', headers: { Authorization: `Bearer ${teamToken}` } },
        );
        assert.strictEqual(revealRes.status, 200);
        assert.ok(revealRes.data?.text);

        const afterReveal = await request('/participant/game', {
          headers: { Authorization: `Bearer ${teamToken}` },
        });
        const reloadedHint = afterReveal.data.progress.find((p: any) => p.levelId === currentLevel.id).level.hints[0];
        assert.strictEqual(reloadedHint.revealed, true);
        assert.strictEqual(reloadedHint.text, revealRes.data.text);
      }

      const wrongRes = await request(`/participant/levels/${currentLevel.id}/answer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamToken}` },
        body: { answer: 'definitelywronganswer999' },
      });
      assert.strictEqual(wrongRes.status, 422);

      console.log('✅ PASSED');
      passed++;
    } catch (err: any) {
      console.log('❌ FAILED\n', err.message);
      failed++;
    }
  }

  // 7. Complete Full 10-Clue Sequence -> Unlock Stage 11 Finale -> Photo Reject/Approve -> Finish
  try {
    process.stdout.write('7. Full Hunt Run (10 Clues -> Finale -> Photo Reject/Re-upload -> Verify Finish)... ');
    let stepsCompleted = 0;
    let finaleLevel: any = null;

    for (let guard = 0; guard < 15; guard++) {
      const stateRes = await request('/participant/game', {
        headers: { Authorization: `Bearer ${teamToken}` },
      });
      const activeProg = stateRes.data.progress.find((p: any) => !p.completedAt);
      if (!activeProg) break;
      const lvl = activeProg.level;

      if (!activeProg.locationReachedAt && lvl.targetLat != null && lvl.targetLng != null) {
        const reach = await request(`/participant/levels/${lvl.id}/reach-location`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teamToken}` },
          body: { lat: lvl.targetLat, lng: lvl.targetLng },
        });
        assert.strictEqual(reach.status, 200);
      }

      if (lvl.isFinal) {
        finaleLevel = lvl;
        break;
      }

      const knownAnswer = answerLookup.get(lvl.title.toLowerCase().trim());
      if (knownAnswer) {
        const ansRes = await request(`/participant/levels/${lvl.id}/answer`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${teamToken}` },
          body: { answer: knownAnswer },
        });
        assert.strictEqual(ansRes.status, 200, `Expected 200 answering ${lvl.title}`);
      } else {
        const advRes = await request(`/admin/teams/${squadTeamId}/force-advance`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.strictEqual(advRes.status, 200);
      }
      stepsCompleted++;
    }

    assert.ok(stepsCompleted >= 10, `Expected >= 10 intermediate steps, got ${stepsCompleted}`);
    assert.ok(finaleLevel && finaleLevel.isFinal, 'Expected Stage 11 Finale to unlock');

    // Upload Victory Photo #1 -> Admin Rejects -> Participant sees rejection across reload -> Re-uploads -> Admin Approves
    const up1 = await uploadDummyPhoto(teamToken);
    assert.strictEqual(up1.status, 201);
    const rejRes = await request(`/admin/photos/${up1.data.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'rejected', reviewNote: 'Faces obscured in test' },
    });
    assert.strictEqual(rejRes.status, 200);

    const afterReject = await request('/participant/game', {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    assert.strictEqual(afterReject.data.latestPhoto?.status, 'rejected');
    assert.strictEqual(afterReject.data.latestPhoto?.reviewNote, 'Faces obscured in test');

    const up2 = await uploadDummyPhoto(teamToken);
    assert.strictEqual(up2.status, 201);
    const appRes = await request(`/admin/photos/${up2.data.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'approved' },
    });
    assert.strictEqual(appRes.status, 200);

    // Submit Finale Passphrase without exclamation punctuation to verify normalized matching
    const finRes = await request(`/participant/levels/${finaleLevel.id}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teamToken}` },
      body: { answer: 'Chacha Wastegan Huyyiyaa' },
    });
    assert.strictEqual(finRes.status, 200);
    assert.strictEqual(finRes.data?.finished, true);

    console.log('✅ PASSED (All 11 stages + photo rejection/approval sync verified)');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // 8. Detailed Leaderboard Audit Breakdown Verification
  try {
    process.stdout.write('8. Detailed Leaderboard Breakdown & Pause->End Timer Math... ');
    const lbRes = await request('/leaderboard');
    assert.strictEqual(lbRes.status, 200);
    const row = lbRes.data.rankings.find((r: any) => r.teamId === squadTeamId);
    assert.ok(row, 'Finished test squad missing from leaderboard');
    assert.strictEqual(row.finished, true);
    assert.strictEqual(row.completedStages, row.totalSteps);
    assert.ok(Array.isArray(row.stageBreakdown) && row.stageBreakdown.length === row.totalSteps);
    assert.ok(Array.isArray(row.penaltyLog));
    assert.strictEqual(row.latestPhotoStatus, 'approved');

    // Pause -> wait 1.1s -> End: verify totalPausedMs absorbs active pause and pausedAt clears
    const pauseRes = await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'pause' },
    });
    assert.strictEqual(pauseRes.status, 200);
    await new Promise((r) => setTimeout(r, 1100));
    const endRes = await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'end' },
    });
    assert.strictEqual(endRes.status, 200);
    assert.strictEqual(endRes.data.status, 'ended');
    assert.strictEqual(endRes.data.pausedAt, null);
    assert.ok(endRes.data.totalPausedMs >= 1000, `Expected totalPausedMs >= 1000, got ${endRes.data.totalPausedMs}`);

    console.log('✅ PASSED');
    passed++;
  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  }

  // Cleanup uploaded test files for squadTeamId, delete test squad, and reset game
  try {
    const uploadDir = path.resolve(__dirname, '../packages/server/uploads', String(squadTeamId));
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
    if (squadTeamId) {
      await request(`/admin/teams/${squadTeamId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
    await request(`/games/${activeGameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'reset' },
    });
    if (seededTempLevels) {
      const lvls = await request(`/levels/game/${activeGameId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (Array.isArray(lvls.data)) {
        for (const l of lvls.data) {
          await request(`/levels/${l.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      }
    }
  } catch {}

  console.log(`\nSuite 3 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runGameplayFlowTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
