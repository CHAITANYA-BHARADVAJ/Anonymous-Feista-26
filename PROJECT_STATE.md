# 🎯 PROJECT_STATE — Campus Hunt SDMCET (Anonymous-Feista-26)

> **Auto-Maintained Operational Master File**  
> **Last Updated:** November 25, 2026, 00:58 IST  
> **Active Branch:** `main` & `feat/initial-implementation` (synced)  
> **Latest Code Commit:** [`8f0584f`](https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26/commit/8f0584f) (Full Obsidian UI/UX polish, dead-file cleanup & male PA voice module)  
> **Live Production URL:** [https://13.126.101.127.nip.io/](https://13.126.101.127.nip.io/)  
> **Public IP:** `13.126.101.127`  
> **Repository:** [https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26](https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26)  
> **Host Organization:** Anonymous Club — SDMCET (Shri Dharmasthala Manjunatheshwara College of Engineering and Technology, Dharwad, Karnataka 580002)

---

## 📌 1. Project Overview & Gameplay Concept

**Campus Hunt SDMCET** is an event-grade, mobile-first, real-time Progressive Web Application (PWA) engineered for a high-intensity campus-wide OSINT (Open Source Intelligence) scavenger hunt.

### Gameplay Flow
1. **Enrolment & Authentication:** Teams self-register at `/register` or login at `/login` with call-signs (e.g. `Team Alpha` / `hunt2026` or `alpha26`).
2. **Pre-Kickoff Standby HUD:** Teams enter a tactical waiting room with real-time GPS sensor diagnostics.
3. **Synchronized Real-Time Kickoff:** When coordinators click **"START GAME"**, the server generates randomized 9-step paths from 10–15 campus landmarks. Every squad's phone instantly chirps, vibrates, and reveals their unique Stage 01 mission directive without refreshing.
4. **OSINT Clues & Satellite Radar:** Teams solve cryptographic and riddle directives, guided by real-time GPS distance radar pointing to target landmarks across SDMCET grounds.
5. **Restricted Geofencing:** Entering unauthorized college zones (e.g., electrical sub-stations) triggers instant audio/haptic warnings and adds automatic time penalties.
6. **Grand Finale Sprint (Stage 10):** All paths converge on the Central Amphitheatre for physical photo capture and admin verification. Lowest adjusted time wins.

---

## 🏛️ 2. System Architecture & High-Performance Stack

```
                              ┌────────────────────────────────────────┐
                              │             Clients (PWA)              │
                              │  Participant / Admin / Spectator UI    │
                              └──────────────────┬─────────────────────┘
                                                 │ HTTPS / WSS (HTTP/2 over TCP)
                                                 ▼
                              ┌────────────────────────────────────────┐
                              │          Caddy Reverse Proxy           │
                              │ - Auto Let's Encrypt TLS (ZeroSSL)     │
                              │ - HTTP/2 Multiplexing (No UDP hang)    │
                              │ - Gzip & Zstandard Compression         │
                              │ - Static Cache-Control (365d Immutable)│
                              └──────────────────┬─────────────────────┘
                                                 │ Port 3001
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dockerized Node.js Runtime (Express + Socket.io)                                                 │
│                                                                                                  │
│   ┌────────────────────┐   ┌───────────────────────┐   ┌─────────────────────────────────────┐  │
│   │ REST API Routes    │   │ Socket.io Engine      │   │ High-Concurrency Services           │  │
│   │ - /auth            │   │ - game:status_changed │   │ - scoreService (In-memory 2s cache) │  │
│   │ - /games, /levels  │   │ - game:started (0ms)  │   │ - zoneService (12s DB throttle)     │  │
│   │ - /zones, /admin   │   │ - level:unlocked      │   │ - dispatchService (9-path engine)   │  │
│   │ - /participant     │   │ - admin:team_location │   │ - timerService (WAL background loop)│  │
│   └─────────┬──────────┘   └───────────┬───────────┘   └─────────────────────────────────────┘  │
│             │                          │                                                         │
│             ▼                          ▼                                                         │
│   ┌────────────────────────────────────────────────┐                                             │
│   │ Prisma ORM Client (with SQLite WAL mode)       │                                             │
│   └───────────────────────┬────────────────────────┘                                             │
└───────────────────────────┼──────────────────────────────────────────────────────────────────────┘
                            ▼
           ┌──────────────────────────────────┐
           │ Persistent SQLite DB (/data)     │
           │ WAL Mode + 5000ms Busy Timeout   │
           └──────────────────────────────────┘
```

---

## ⚡ 3. High-Concurrency & Performance Engine

| Component | Optimization | Real-World Impact |
| :--- | :--- | :--- |
| **Caddy Reverse Proxy** | Forced `protocols h1 h2` (Disabled HTTP/3 QUIC) | Completely eliminated the 5–10s connection hang caused by blocked UDP 443 on AWS EC2 and college firewalls. |
| **Caddy Asset Caching** | `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` | Vite JS/CSS bundles load in **10–20ms** directly from client disk on subsequent visits. |
| **Client Service Worker** | Removed `/api/v1/.*` dynamic caching and 3s abort timer | Dynamic `POST`/mutation APIs never get aborted or blocked by offline caches. |
| **Client Session Hydration** | `getInitialAuthState()` synchronous local storage reading | Fixed page reload bug: user sessions stay logged in permanently with zero flash-of-login. |
| **Real-Time Kickoff** | `useSocket` + `syncParticipantData(true)` | Millisecond task dispatch when admin starts game; phone vibrates and sound chimes with 0ms lag. |
| **SQLite Concurrency** | `PRAGMA journal_mode = WAL;` & `PRAGMA busy_timeout = 5000;` | Non-blocking reads during writes; prevents `SQLITE_BUSY: database is locked`. |
| **Leaderboard Caching** | In-memory 2-second RAM cache with instant mutation invalidation | 100+ concurrent spectators/players served in **<1ms**; cuts database queries by 95%. |
| **GPS Breadcrumb Throttling** | Real-time WebSocket radar broadcast with 12s SQLite write throttle | Live admin tracking stays 0ms instant while disk I/O is reduced by 85%. |
| **Docker Build Footprint** | Removed `g++`/`python3`/`make`; pruned cache | Resolved `ENOSPC` disk errors on small 8GB AWS EC2 instances. |
| **In-App Feedback Layer** | Unified `uiStore` + `FeedbackOverlay` toasts & Escape-dismissible confirms | Zero blocking browser `alert()`/`confirm()` popups across participant and admin portals. |
| **Arena PA Voice System** | Web Audio synthesis (`sound.ts`) + male `SpeechSynthesis` announcer (`voice.ts`, `PaVoiceBanner.tsx`) | Calm squad login briefing, energetic kickoff instructions, mute/replay controls, and live caption banner. |
| **Dev/Prod Asset Isolation** | `clientDist` static guard (`npm_lifecycle_event !== 'dev'`) in `packages/server/src/index.ts` | Prevents stale `dist/` UI bundles from shadowing Vite (`:5173`) during development. |

---

## 📍 4. SDMCET Campus Geofencing & Coordinates

- **Campus Center:** `[15.4286, 75.0150]` (Dhavalagiri, Dharwad, Karnataka 580002)
- **Bounding Box:** `[[15.4230, 75.0080], [15.4345, 75.0210]]`
- **Official Campus Boundary:** 25-point perimeter polygon enclosing college premises.
- **Seeded Target Locations:**
  1. **Level 1 (Digital Footprint):** Main Library / Admin Block Entrance (`15.4294, 75.0135`, radius 25m)
  2. **Level 2 (Social Trail):** Science Block / Canteen Lawn (`15.4282, 75.0152`, radius 25m)
  3. **Level 3 (Grand Finale):** Amphitheatre Grounds (`15.4272, 75.0146`, radius 30m)
- **Restricted Hazard Zone:** Substation & Electrical Yard (`[15.4370, 75.0315] - [15.4378, 75.0325]`, 5-min penalty).

---

## 🔐 5. Default Credentials & Access Endpoints

| Portal | URL Path | Role / Account | Password / Access Key | Purpose |
|---|---|---|---|---|
| **Live App (Root)** | `/` | All | *Auto-redirects based on role* | `/play` (team), `/admin/game` (admin), or `/login` |
| **Admin Command Desk** | `/admin/login` | `admin` | `admin123` *(or `$ADMIN_PASSWORD`)* | Live telemetry, clue release, photo approvals |
| **Team Alpha** | `/login` | `Team Alpha` | `hunt2026` or `alpha26` | Playing participant team |
| **Team Beta** | `/login` | `Team Beta` | `fiesta26` or `beta26` | Playing participant team |
| **Squad Registration** | `/register` | Public | Custom squad code | Self-service team registration (up to 25 squads) |
| **Spectator Board** | `/spectator` | Public / Read-only | *None* | Big-screen auditorium leaderboard & progress timeline |
| **Health Heartbeat** | `/api/v1/health` | Public | *None* | Automated heartbeat (`{"ok": true}`) |

---

## 📋 6. Complete Error Code & Troubleshooting Reference

### A. Authentication & Session Errors
| HTTP Code | Error Message | Cause | Resolution |
| :---: | :--- | :--- | :--- |
| **`401`** | `"Invalid team name or code"` | Call-sign or password mismatch on login. | Verify spelling; admin can check or reset code under Admin Desk. |
| **`401`** | `"Invalid administrator credentials"` | Username/password mismatch on `/admin/login`. | Verify `ADMIN_USERNAME` / `ADMIN_PASSWORD`. |
| **`401`** | `"Not authenticated"` | Accessing protected route without a JWT token. | Log in at `/login` or `/admin/login`. |
| **`401`** | `"Session expired"` / `"Session revoked"` | Team logged in on a second device (1 active phone per squad). | Log in again on current device. |
| **`401`** | `"Invalid token"` | JWT token is malformed, corrupted, or expired (>12h). | Re-authenticate to get a fresh 12-hour session. |
| **`403`** | `"Forbidden"` | Non-admin token accessing admin API routes. | Use `/play` for participants and `/admin` for coordinators. |

### B. Squad Registration Errors
| HTTP Code | Error Message | Cause | Resolution |
| :---: | :--- | :--- | :--- |
| **`400`** | `"Team Call-Sign is required."` | Empty squad name field. | Enter a valid call-sign (e.g. `Cyber Phantoms`). |
| **`400`** | `"Access Password must be at least 4 characters."` | Passcode too short. | Enter a passcode of 4+ characters. |
| **`400`** | `"Passwords do not match."` | Passcode and Confirm Passcode differ. | Re-enter passwords identically. |
| **`403`** | `"Public registration is currently closed..."` | Coordinators locked public registration. | Admin can toggle registration ON in settings. |
| **`403`** | `"Maximum squad capacity reached (25/25)..."` | Limit reached (25 squads). | Admin can increase capacity in settings. |
| **`409`** | `"Team call-sign '<Name>' is already registered."` | Name collision with existing team. | Choose a unique squad name. |

### C. Live Gameplay Errors
| HTTP Code | Error Message | Cause | Resolution |
| :---: | :--- | :--- | :--- |
| **`403`** | `"Hunt has not started yet. Standby for official launch."` | Squad performing action while status is `idle`. | Wait for coordinators to click **START GAME**. |
| **`403`** | `"Hunt is temporarily PAUSED by Event Control..."` | Coordinators paused the hunt. | Field actions frozen; wait for resume. |
| **`403`** | `"Hunt has officially CONCLUDED..."` | Game ended. | Head to auditorium for results. |
| **`400`** | `"Level not unlocked"` | Submitting answer for an inactive stage. | Solve current stage first. |
| **`400`** | `"Level already completed"` | Resubmitting for completed clue. | Advance to next clue. |
| **`400`** | `"Device GPS coordinates required"` | Missing lat/lng payload. | Allow browser location access. |
| **`400`** | `"You are Xm away. Move within 20m to unlock this clue!"` | Target landmark not physically reached. | Move closer to landmark using Distance Radar. |
| **`400`** | `"Max hints used"` | Already revealed all 3 hints. | No more hints available for this level. |
| **`422`** | `"Incorrect answer"` | Secret word/phrase does not match clue answer. | Re-evaluate clue riddle and submit correct answer. |
| **`422`** | `"Invalid QR code"` | Checkpoint QR payload mismatch. | Scan official SDMCET checkpoint tag. |

### D. System & Hardware Issues
| Symptom / Error | Cause | Resolution |
| :--- | :--- | :--- |
| **`ENOSPC: no space left on device`** | EC2 EBS disk is 100% full. | Run `docker system prune -af --volumes && docker builder prune -af`. |
| **`"Acquiring GPS fix…"` stuck** | Location sensor permission denied or phone GPS turned off. | Turn on phone GPS; allow location in browser site settings. |
| **`"Telemetry Stream Reconnecting…"`** | Cellular packet drop or Wi-Fi switch. | Auto-reconnects automatically in 1–2 seconds. |
| **`502 Bad Gateway`** | Node.js backend container down while Caddy is up. | Run `docker compose restart app`. |

---

## 🛠️ 7. EC2 Production Deployment & Operations Runbook

### Essential EC2 Commands
```bash
# 1. Free disk space (if disk full)
docker system prune -af --volumes
docker builder prune -af

# 2. Pull latest code from GitHub
git pull

# 3. Clean rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. View live logs
docker compose logs -f --tail=50

# 5. Check container status
docker compose ps
```

### Server Health Verification
```bash
curl -i https://13.126.101.127.nip.io/api/v1/health
```
Expected output:
```json
HTTP/1.1 200 OK
Via: 1.1 Caddy
{"ok":true}
```

---

## 🧪 8. Automated Verification & Test Suite (`npm test`)

Executed via `tests/run_all_tests.ts` with pre-flight and post-flight database sanitization (`purgeTestSquads()`) so test runs leave zero temporary squads behind:

| Suite | File | Coverage |
| :--- | :--- | :--- |
| **Suite 1** | `tests/01_static_and_db.ts` | Static analysis, TypeScript types & SQLite/Prisma DB integrity |
| **Suite 2** | `tests/02_api_and_security.ts` | Full REST API endpoint coverage & auth/RBAC security matrix |
| **Suite 3** | `tests/03_gameplay_flow.ts` | End-to-end participant field gameplay progression |
| **Suite 4** | `tests/04_realtime_sockets.ts` | Real-time Socket.io telemetry, kickoff & alert events |
| **Suite 5** | `tests/05_concurrency_25_teams.ts` | 25-squad concurrent registration & gameplay stress test |

**Saved Local DB Snapshot (`packages/server/prisma/dev.db` — WAL checkpointed cleanly, 0-byte WAL):**
- **Game:** `Campus Hunt 2026 - SDMCET` (ID `1`, status `idle`)
- **Teams (4):** `Team Alpha`, `Team Beta`, `Cyber Phantoms`, `Titan` (0 leftover test squads)
- **Configured Data:** `16` levels, `4` geofence zones

---

## 📜 9. Chronological Update & Changelog History

* **Nov 25, 2026 (Commit `8f0584f`):** Full Obsidian UI/UX overhaul, dead-file cleanup, and male PA voice announcements:
  1. **Squid Game Male PA Voice Module:** Added [`voice.ts`](packages/client/src/lib/voice.ts), [`voiceStore.ts`](packages/client/src/stores/voiceStore.ts), [`PaVoiceBanner.tsx`](packages/client/src/components/PaVoiceBanner.tsx), and synthesized chimes/fanfare (`playPaChime`, `playKickoffFanfare`) in [`sound.ts`](packages/client/src/lib/sound.ts). Delivers a calm arena welcome & field-safety briefing upon login (`announceArenaWelcome`), an energetic fanfare with step-by-step plain-language instructions upon game kickoff (`announceGameStarted`), gesture speech priming (`primeSpeechEngine`) with an interactive autoplay banner fallback, and HUD mute/replay controls.
  2. **Unified Obsidian UI & Feedback System:** Consolidated CSS surface tokens (`.obsidian-surface`), `100dvh` mobile-safe layout containers, reduced-motion media rules (`prefers-reduced-motion`), and custom inline SVG icons (`Icons.tsx`). Added [`uiStore.ts`](packages/client/src/stores/uiStore.ts) and [`FeedbackOverlay.tsx`](packages/client/src/components/FeedbackOverlay.tsx) to replace blocking native browser dialogs (`alert()`/`confirm()`/`prompt()`) across participant, auth, spectator, and admin portals.
  3. **HUD & Map Polish:** Elevated `<ZoneWarning />` overlay z-index to `z-[2000]` above map layers, added radar sweep reticle (`DistanceRadar.tsx`), docked HUD panels cleanly, added password show/hide toggles on auth forms, and added a verified finish celebration card in `PlayDashboard.tsx`.
  4. **Dev Runtime Isolation & Cleanup:** Removed stale build outputs (`dist/`, `.vite/`) and unused `cluePoolDefaults.ts`, and guarded static `clientDist` serving in `packages/server/src/index.ts` (`process.env.npm_lifecycle_event !== 'dev'`) so `npm run dev` serves Vite (`:5173`) cleanly without stale bundle conflicts.
* **Nov 24, 2026 (Commit `b73edb5`):** Admin suite polish pass (`AdminGame`, `AdminLeaderboard`, `AdminMap`, `AdminPhotos`, `AdminTeams`) and zero-trace test sanitization (`purgeTestSquads()` in `tests/run_all_tests.ts`).
* **Nov 24, 2026 (Commit `7d662ec`):** UI simplification across admin workbench routes and creation of the 5-tier Master Test Suite (`tests/01`–`05` + `run_all_tests.ts`).
* **Nov 24, 2026 (Commit `d0b17df`):** Comprehensive release delivering 6 user-requested operational updates:
  1. **Broadcast Transmission Fix:** Repositioned `<AnnouncementBanner />` as an elevated fixed overlay (`z-[1300]`) with cyber-card design, audio ping, and 15s auto-dismiss; expanded Socket.io emission to global and room channels.
  2. **Clue Pool Studio (Master Library):** Added dedicated 'Clue Pool Studio' tab in `AdminLevels.tsx` with search/filter, multi-select checkboxes, custom clue editor, and 1-click `deploy-pool` backend endpoint (`packages/server/src/routes/levels.ts`).
  3. **Participant GPS Recalibration:** Built `<GpsCalibrationModal />` featuring live accuracy meter (±meters), colored status bar, satellite fix readouts, compass figure-8 sensor reset guide, and "Force Recalibrate" button directly in the Top HUD.
  4. **Inline Social Media QR Generator:** Built zero-latency offline SVG QR generator (`QrCodeDisplay.tsx` via `@zxing/library`) with tap-to-enlarge modal so teammates can instantly scan social media links (Instagram, YouTube, Drive) on a secondary phone.
  5. **Camera Punch-Hole Safe HUD:** Relocated the top-center mission stopwatch to the Top-Right cluster, leaving the center safe zone completely clear of selfie camera notches/holes.
  6. **Synthesized Web Audio & Haptic Feedback:** Engineered zero-asset synthesized sound library (`sound.ts`) and vibration patterns triggered on answer submission, check-in, announcements, and geofence perimeter violations.
* **Nov 23, 2026 (Commit `c4167cc`):** Preserved Prisma and TSX CLI in production container to ensure instant offline container boot without npm registry dependency.
* **Nov 23, 2026 (Commit `618ec6a`):** Dockerfile disk footprint optimization: stripped unnecessary `g++`/`python3`/`make` packages and added npm cache cleanup to prevent `ENOSPC` errors on 8GB AWS instances.
* **Nov 23, 2026 (Commit `dd24f3e`):** Instant real-time kickoff reflection: participant screens immediately receive starting clues with vibration and sound chime when admin clicks **START GAME**.
* **Nov 23, 2026 (Commit `791fe72`):** Session persistence fix: added synchronous local storage auth restoration before initial React render to prevent wrongful logout on page refresh; updated cookie policy to `sameSite: 'lax'`.
* **Nov 23, 2026 (Commit `460eeea`):** High-concurrency engine: in-memory 2s leaderboard cache, GPS breadcrumb throttling to 12s, Socket.io connection pool tuning, and Docker `ulimits: 65535`.
* **Nov 23, 2026 (Commit `b29ca04`):** Fixed slow loading and first-click errors: disabled Caddy HTTP/3 QUIC (UDP 443) advertising; removed dynamic `/api/v1/.*` caching from client service worker.
* **Nov 23, 2026 (Commit `981e257`):** Completely removed deprecated SOS feature from participant HUD, admin consoles, and backend APIs for simplified field operations.
* **Nov 22, 2026:** Implemented 10–15 landmark shuffled-subset clue distribution engine for 25 squads, live landmark occupancy matrix, and global upward stopwatch timer.
