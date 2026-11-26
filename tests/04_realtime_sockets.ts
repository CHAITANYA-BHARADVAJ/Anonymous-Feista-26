import { io as ClientSocket, Socket } from 'socket.io-client';
import http from 'http';

const SERVER_URL = 'http://localhost:3001';
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

async function runSocketRealtimeTests() {
  console.log('\n======================================================');
  console.log('🧪 TEST SUITE 4: Real-Time WebSocket Telemetry & Events');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Get Tokens
  const adminRes = await request('/auth/admin/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminRes.data?.token;

  const teamRes = await request('/auth/team/register', {
    method: 'POST',
    body: {
      name: `SocketSquad_${Date.now()}`,
      code: 'socketpass26',
      leaderName: 'Socket Leader',
      mobile: '9123456789',
    },
  });
  const teamToken = teamRes.data?.token;
  const teamId = teamRes.data?.teamId;

  const games = await request('/games', { headers: { Authorization: `Bearer ${adminToken}` } });
  const gameId = games.data?.[0]?.id || 1;

  // Ensure at least 1 clue exists for starting the game; clean it up if we created it
  let tempLevelId: number | null = null;
  const existingLevels = await request(`/levels/game/${gameId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!Array.isArray(existingLevels.data) || existingLevels.data.length === 0) {
    const created = await request(`/levels/game/${gameId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        title: 'Socket Temp Clue',
        orderIndex: 1,
        clueText: 'Temp socket test clue',
        locationHint: 'Main Quad',
        answer: 'socketkey',
        targetLat: 15.4286,
        targetLng: 75.015,
        triggerRadiusMeters: 25,
        isFinal: false,
      },
    });
    tempLevelId = created.data?.id ?? null;
  }

  // Put game in 'running' mode so location updates are accepted
  await request(`/games/${gameId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { action: 'start' },
  });

  let adminSocket: Socket | null = null;
  let teamSocket: Socket | null = null;
  let spectatorSocket: Socket | null = null;

  try {
    // 1. Connect Admin Socket
    process.stdout.write('1. Connecting Admin WebSocket client... ');
    adminSocket = ClientSocket(SERVER_URL, {
      auth: { token: adminToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Admin socket timeout')), 4000);
      adminSocket!.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      adminSocket!.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    console.log(`✅ PASSED (Connected, Socket ID: ${adminSocket.id})`);
    passed++;

    // 2. Connect Team Socket
    process.stdout.write('2. Connecting Participant Team WebSocket client... ');
    teamSocket = ClientSocket(SERVER_URL, {
      auth: { token: teamToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Team socket timeout')), 4000);
      teamSocket!.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      teamSocket!.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    console.log(`✅ PASSED (Connected, Socket ID: ${teamSocket.id})`);
    passed++;

    // 3. Connect Spectator Socket
    process.stdout.write('3. Connecting Public Spectator WebSocket client... ');
    spectatorSocket = ClientSocket(SERVER_URL, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Spectator socket timeout')), 4000);
      spectatorSocket!.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      spectatorSocket!.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    console.log(`✅ PASSED (Connected, Socket ID: ${spectatorSocket.id})`);
    passed++;

    // 4. Test GPS Breadcrumb: Team -> Admin Radar Stream
    process.stdout.write('4. Testing Real-time GPS Radar Broadcast (Team -> Admin)... ');
    const gpsPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Did not receive admin:team_location within timeout')), 4000);
      adminSocket!.on('admin:team_location', (data: any) => {
        if (data.teamId === teamId) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    // Participant emits location:update
    teamSocket.emit('location:update', {
      lat: 15.4286,
      lng: 75.0150,
    });

    await gpsPromise;
    console.log('✅ PASSED (Admin received instant GPS breadcrumb)');
    passed++;

    // 5. Test Live Broadcast Announcement (Admin -> Team HUD)
    process.stdout.write('5. Testing Radio Transmission Announcement (Admin -> Team HUD)... ');
    const announcementPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Did not receive game:announcement in 4s')), 4000);
      teamSocket!.on('game:announcement', (ann: any) => {
        if (ann.message?.includes('Realtime Telemetry Test')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await request(`/games/${gameId}/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        message: 'Realtime Telemetry Test Announcement',
        kind: 'broadcast',
      },
    });

    await announcementPromise;
    console.log('✅ PASSED (Team phone received announcement instantaneously)');
    passed++;

    // 6. Test Game Status Synchronization (All Clients)
    process.stdout.write('6. Testing Status Change Synchronization (Broadcast to All)... ');
    const statusPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Did not receive game:status_changed in 4s')), 4000);
      spectatorSocket!.on('game:status_changed', (data: any) => {
        if (data.status === 'paused') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await request(`/games/${gameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'pause' },
    });

    await statusPromise;
    console.log('✅ PASSED (Spectator board received game:status_changed: paused)');
    passed++;

    // Restore to idle and delete test team
    await request(`/games/${gameId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { action: 'reset' },
    });

    if (teamId) {
      await request(`/admin/teams/${teamId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
    if (tempLevelId) {
      await request(`/levels/${tempLevelId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }

  } catch (err: any) {
    console.log('❌ FAILED\n', err.message);
    failed++;
  } finally {
    if (adminSocket) adminSocket.disconnect();
    if (teamSocket) teamSocket.disconnect();
    if (spectatorSocket) spectatorSocket.disconnect();
  }

  console.log(`\nSuite 4 Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runSocketRealtimeTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
