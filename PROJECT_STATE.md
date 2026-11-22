# 🎯 PROJECT_STATE — Campus Hunt SDMCET (Anonymous-Feista-26)

**Last Updated:** November 22, 2026, 11:35 IST  
**Branch:** `feat/initial-implementation`  
**Status:** Shuffled-subset clue distribution (10-15 locations for 25 squads) & global upward stopwatch timer engine implemented. All type checks clean.
**Repository:** [Anonymous-Feista-26](https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26)  
**Host Organization:** Anonymous Club — SDMCET (Shri Dharmasthala Manjunatheshwara College of Engineering and Technology, Dharwad, Karnataka 580002)

---

## 📌 1. Project Overview & Gameplay Concept

**Campus Hunt SDMCET** is an event-grade, mobile-first, real-time Progressive Web Application (PWA) designed for a high-intensity campus-wide OSINT (Open Source Intelligence) scavenger hunt.

### Gameplay Workflow
1. **Briefing & Auth:** Teams log in on mobile devices using call-sign credentials (e.g., `Team Alpha` / `hunt2026`).
2. **OSINT Clues & Satellite Radar:** Teams receive cryptographic and social media clues, coupled with real-time GPS proximity radar pointing to target locations across SDMCET campus grounds.
3. **Restricted Geofencing:** Entering unauthorized college zones (e.g., electrical sub-stations) triggers immediate audio/haptic alarms and automatic time penalties.
4. **Target Capture & Photo Validation:** Upon reaching the physical target person or landmark, teams capture a live photo with camera constraints (`capture="environment"` preventing gallery uploads).
5. **Admin Review & Instant Verification:** Photos flow into an admin command console for verification. First approved team to complete all levels and reach the final venue wins.

---

## 🏛️ 2. System Architecture & Tech Stack

```
                              ┌────────────────────────────────────────┐
                              │             Clients (PWA)              │
                              │  Participant / Admin / Spectator UI    │
                              └──────────────────┬─────────────────────┘
                                                 │ HTTPS / WSS
                                                 ▼
                              ┌────────────────────────────────────────┐
                              │          Caddy Reverse Proxy           │
                              │   Automated TLS / Let's Encrypt / HTTP3 │
                              └──────────────────┬─────────────────────┘
                                                 │ Port 3001
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dockerized Node.js Runtime (Express + Socket.io)                                                 │
│                                                                                                  │
│   ┌────────────────────┐   ┌───────────────────────┐   ┌─────────────────────────────────────┐  │
│   │ REST API Routes    │   │ Socket.io Engine      │   │ Server-side Services                │  │
│   │ - /auth            │   │ - game:* status       │   │ - scoreService (Adjusted Time)      │  │
│   │ - /games, /levels  │   │ - admin:team_location │   │ - timerService (Reschedule recovery)│  │
│   │ - /zones, /admin   │   │ - sos:received        │   │ - zoneService (@turf geofence)      │  │
│   │ - /participant     │   │ - team:checkpoint     │   └─────────────────────────────────────┘  │
│   └─────────┬──────────┘   └───────────┬───────────┘                                             │
│             │                          │                                                         │
│             ▼                          ▼                                                         │
│   ┌────────────────────────────────────────────────┐                                             │
│   │ Prisma ORM Client                              │                                             │
│   └───────────────────────┬────────────────────────┘                                             │
└───────────────────────────┼──────────────────────────────────────────────────────────────────────┘
                            ▼
           ┌──────────────────────────────────┐
           │ Persistent SQLite DB (/data)     │
           │ Dev / Production Storage         │
           └──────────────────────────────────┘
```

### Monorepo Structure
- **Root Workspace:** `package.json` with npm workspaces (`packages/client`, `packages/server`).
- **`packages/client`:**
  - **Framework:** React 18, Vite, TypeScript, Tailwind CSS.
  - **Mapping & GIS:** Leaflet & `react-leaflet` with dynamic layer switcher (Google Satellite, Google Hybrid, Esri World Imagery, OpenStreetMap).
  - **State Management:** Zustand (`authStore`, `gameStore`).
  - **Hardware/PWA Integrations:** Geolocation API (`useLocation`), Vibration API, Web Audio API synthesizers (`sound.ts`), Screen WakeLock API (`wakeLock.ts`), Fullscreen API (`fullscreen.ts`).
  - **Branding:** Anonymous Club SDMCET theme (military/cyber HUD styling, terminal monospace typography, high-contrast dark palette `#030712`, `#0a0f1d`, `#10b981`, `#06b6d4`, `#f59e0b`, `#ef4444`).
- **`packages/server`:**
  - **Framework:** Node.js 20, Express, TypeScript.
  - **WebSockets:** Socket.io with room separation (`game`, `team:<id>`, `admin`, `spectator`).
  - **Database:** Prisma ORM backed by SQLite (mounted at persistent volume `/data/dev.db` in Docker).
  - **Authentication:** JWT stored in `httpOnly` cookie (`token`) and optional Authorization header fallback.
  - **File Uploads:** Multer with mime filtering and disk storage under `/uploads`.

---

## 📍 3. SDMCET Campus Geofencing & Coordinates

- **Campus Center:** `[15.4286, 75.0150]` (Dhavalagiri, Dharwad, Karnataka 580002)
- **Bounding Box:** `[[15.4230, 75.0080], [15.4345, 75.0210]]`
- **Official Campus Boundary:** 25-point perimeter polygon enclosing college premises.
- **Seeded Target Locations:**
  1. **Level 1 (Digital Footprint):** Main Library / Admin Block Entrance (`15.4294, 75.0135`, radius 25m)
  2. **Level 2 (Social Trail):** Science Block / Canteen Lawn (`15.4282, 75.0152`, radius 25m)
  3. **Level 3 (Grand Finale):** Amphitheatre Grounds (`15.4272, 75.0146`, radius 30m)
- **Restricted Hazard Zone:** Substation & Electrical Yard (`[15.4370, 75.0315] - [15.4378, 75.0325]`, 5-min penalty).

---

## 🔐 4. Default Credentials & Access Endpoints

| Portal | URL Path | Role / Account | Password / Access Key | Purpose |
|---|---|---|---|---|
| **Admin Command Desk** | `/admin/login` | `admin` | `admin123` *(or `$ADMIN_PASSWORD`)* | Live telemetry, clue release, SOS panel, photo approvals |
| **Team Alpha** | `/login` | `Team Alpha` | `hunt2026` | Playing participant team |
| **Team Beta** | `/login` | `Team Beta` | `fiesta26` | Playing participant team |
| **Spectator Board** | `/spectator` | Public / Read-only | *None* | Big-screen auditorium leaderboard & progress timeline |
| **Health Check** | `/api/v1/health` | Public | *None* | Automated heartbeat (`{"ok": true}`) |

---

## ⏱️ 5. Scoring & Timer Engine

**Authoritative Server-Side Formula:**
```
adjusted_time = (finish_ts − game_start_ts − total_paused_ms)
              + hint_penalties
              + zone_penalties
              − checkpoint_bonuses
```
- **Global Stopwatch Engine:** Clocks count UP from `00:00:00` for all squads starting at `game.startedAt`. Teams advance by solving clues at their own pace without arbitrary timeout auto-advances. Lowest finish time + penalties wins.
- **Penalty Accumulation:** Using hints incurs explicit time penalties (+2m, +4m, +6m), and restricted zone violations add trespass penalties to the official adjusted time.
- **Global Pause & Soft Limit:** Pausing freezes all teams' clocks simultaneously via `totalPausedMs`. The 60-minute duration is an advisory soft limit; gameplay continues until event coordinators officially stop/end the hunt.
- **Privacy Enforcement:** Team GPS coordinates are broadcast exclusively to the `admin` room; participant and spectator sockets never receive other teams' positions.

---

## ☁️ 6. AWS EC2 Production Deployment

The project is containerized for 1-click deployment on Ubuntu 24.04/22.04 LTS (t3.micro / t3.small).

### Architecture Components
- **`Dockerfile`:** Multi-stage build with `builder` (node:20-bookworm-slim, compiles client Vite dist and server dist) and `runner` (production dependencies, Prisma client, entrypoint).
- **`docker-entrypoint.sh`:** Auto-creates directories, runs `npx prisma db push --accept-data-loss`, verifies game count, auto-seeds default levels/teams if count is 0 or `FORCE_SEED=true`, then executes server.
- **`Caddyfile`:** Reverse proxy handling automatic ACME Let's Encrypt certificates, WebSocket upgrading (`reverse_proxy app:3001`), and gzip/zstd compression.
- **`docker-compose.yml`:** Coordinates `app` and `caddy` services with persistent named volumes `data` and `uploads`.

### EC2 Security Group Requirements
- **Port 22 (SSH):** Administrator remote access.
- **Port 80 (HTTP):** Required for ACME Let's Encrypt HTTP-01 challenge.
- **Port 443 (HTTPS/QUIC):** Participant & Admin traffic. **Required for mobile browser Geolocation & Camera APIs**.

### Production `.env` Variables
```env
DOMAIN=13.233.50.120.nip.io         # Or custom domain e.g. hunt.sdmcet.ac.in
ACME_EMAIL=admin@anonymoussdmcet.in
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123             # Change to strong password for production
JWT_SECRET=tactical_sdmcet_secret_key_2026_change_me
FORCE_SEED=false
```

### Essential EC2 Deployment Commands
```bash
# Start or rebuild the production stack
docker compose up -d --build

# View logs in real-time
docker compose logs -f app
docker compose logs -f caddy

# Restart or stop
docker compose restart
docker compose down

# Re-seed database if fresh deployment needed
docker compose run --rm app npx tsx /app/packages/server/prisma/seed.ts
```

---

## 🚀 7. Current Project Status

- [x] Monorepo setup with shared build and dev scripts (`npm run dev`, `npm run build`).
- [x] Prisma database migrations and SDMCET campus data seed.
- [x] Satellite layer switcher (Google Satellite, Hybrid, Esri, OSM).
- [x] Dynamic radar distance sweep with audio ping cues.
- [x] Mobile auto-fullscreen on gesture with floating HUD re-engage toggle.
- [x] Complete Admin Game Master redesign into high-performance mission control:
  - **Command Desk (`/admin/game`):** Master game state controller, elapsed digital clock, 6 real-time KPI tiles, 1-click SOS resolver with Google Maps integration, direct team telemetry pipeline, failsafes (force unlock/complete), time adjustments (+/- minutes with reason), rapid radio transmitter with preset broadcasts, and direct 1-click link to Live Field Radar.
  - **Live Field Radar Map (`/admin/map`):** Dedicated real-time tactical satellite map streaming all competing squads' GPS coordinates as they move across campus grounds. Features color-coded custom squad markers, live SOS hazard beacons, campus boundary and restricted hazard overlays, landmark clue targets, quick squad centering/focus, satellite layer switching (Google Sat, Hybrid, Esri, OSM), and a searchable squad telemetry drawer with direct Google Maps and radio nudge shortcuts.
  - **Map, Objectives & Geofencing Studio (`/admin/levels`):** Completely overhauled with clear mode tabs:
    - *Objectives & Clues Mode:* Unambiguous 4-step card flow (Title, Visual satellite target placement with campus landmark presets e.g. Library, Amphitheatre, Canteen, Geofence trigger radius slider with live circle, Campus sector guidance, Decrypted clue text, Secret passcode answer vs Grand Finale photo verification, and built-in Hint #1/#2/#3 editor with time penalties).
    - *Restricted Areas Mode (Hazard Zones):* Visual hazard zone builder supporting Quick Center & Radius (e.g. 35m) or Custom Polygon Corners on the satellite map, custom trespass time penalty (e.g. 5m), live preview polygon, and zone toggle/delete management.
    - *Playing Area Mode (Boundary):* Interactive campus boundary drawer to define permitted gameplay areas on the map.
  - **Team Roster & Credentials (`/admin/teams`):** Registration desk, instant code generator, credential tracking, and printable login slips modal for on-campus registration.
  - **Photo Verification Desk (`/admin/photos`):** Live review queue with photo preview modal, approval / rejection feedback, and 1-click victory finish shortcut.
  - **Standings & Podium (`/admin/leaderboard`):** Live adjusted-time rankings, top 3 gold/silver/bronze highlight podium, and 1-click CSV report export.
  - **Left-Sliding Navigation Bar (`/admin`):** Minimal sleek collapsible left rail (`w-16`) that expands smoothly on hover (`w-64`) with badges for live SOS alerts and pending photo approvals.
  - **Safe Level Deletion & Reordering:** Fixed SQLite foreign key constraint violations via full transactional relation cascade (hints, checkpoints, progress) and automatic sequence re-indexing (`orderIndex`), plus Up (▲) / Down (▼) level reordering in the studio.
  - **Minimal & Sleek Dark Zinc UI:** Replaced loud neon colors with a minimal, professional monochrome dark zinc palette (`zinc-950`/`zinc-900`) and clean typography.
  - **Resilient Participant Login:** Trimmed and case-insensitive authentication with fallback, preventing HTTP 500 errors.
  - **Live Activity Audit Feed:** Streaming real-time event log for coordinators in the Command Desk.
- [x] Geofencing detection with Turf.js for boundary & restricted zones.
- [x] Direct live photo snap & transmit on participant Finale objective.
- [x] Single-Page Participant Tactical HUD (`/play`):
  - **Unified Single-Screen Architecture:** Completely eliminated multi-tab navigation (`Briefing`, `Intel`, `Radar`, `Standings`, `Operative`) in favor of a single high-performance cockpit HUD.
  - **Full-Screen Satellite Map:** Always-visible SDMCET campus satellite map with real-time GPS player marker, accuracy radius, campus perimeter, and auto-centering.
  - **Dynamic Moving Direction Arrow:**
    - Real-time azimuth calculation to target landmark relative to phone heading.
    - Full gyroscope/compass sensor integration (`deviceorientationabsolute`, `deviceorientation`, `webkitCompassHeading`, and GPS heading fallback).
    - Unwrapped angle smoothing to eliminate 360° reverse spin glitches.
    - Interactive touch/drag dial rotation enabling manual aiming, testing on desktop, and field compass calibration.
    - Continuous direction guidance (`STRAIGHT AHEAD`, `BEAR SLIGHT RIGHT`, `TURN LEFT`, etc.).
  - **Floating Minimizable Action Sheet:** Smooth peek mode (minimal bar so players see full map) expanding into full intelligence briefing, campus guidance, tactical assistance hints (with +2m, +4m, +6m penalty confirmations), decoded solution submission, and finale camera capture.
  - **Participant Leaderboard Removal:** Completely removed the leaderboard from the participant portal so teams remain focused on their own mission without distractions.
  - **Operative Dossier Modal:** Instant access to team call-sign, cleared stages, hint counters, hardware diagnostics (GPS, WebSockets), and field terminal sign out.
- [x] Shuffled-Subset Clue Distribution Engine (10–15 Physical Landmarks × 25 Teams):
  - **Path Dispatcher (`dispatchService.ts`):** Supports 10–15 physical campus landmarks for up to 25 competing squads. Each squad is assigned a balanced subset of 9 intermediate clues, shuffled via Fisher-Yates into a unique progression path (`TeamPath`).
  - **Collisions Handled Transparently:** Multiple squads can explore the same physical landmark at different times or simultaneously, removing the hard constraint of needing 25+ distinct stations across campus.
  - **Common Grand Finale:** Upon completing all 9 assigned intermediate clues, every squad's 10th objective automatically locks to the single common Grand Finale at the Central Amphitheatre for live photo verification and podium sprint.
  - **Live Campus Landmark Occupancy Monitor:** Admin Command Desk displays a live real-time matrix of all stations, showing active occupant squad counts and identities per landmark.
  - **Upward Stopwatch HUD:** Participants and spectators see the global elapsed time counting UP, with hint penalty accumulation (+2m, +4m, +6m) clearly badged. Lowest adjusted finish time takes 1st place on the podium.
- [x] Public Squad Self-Registration Portal (`/register`):
  - **Self-Service Enrolment:** Teams self-register with Team Call-Sign, Squad Leader Name, Mobile/WhatsApp, and custom Access Passcode.
  - **Capacity Controls:** Real-time capacity bar (up to 25 squads max), registration open/closed toggle in admin desk, and duplicate call-sign prevention.
  - **Pre-Kickoff Standby HUD:** Registered teams enter a tactical waiting room with live GPS sensor diagnostics, automatically unlocking their starting clue when Event Control initiates the synchronized kickoff.
- [x] Resilient Event State Orchestration (Pause, Resume, End, Reset):
  - **Idempotent State Machine:** Backend `PATCH /api/v1/games/:id/status` and `/api/v1/games/status` handle double clicks, re-entrant pause/resume, and end calls safely without throwing HTTP 400 errors.
  - **Non-Blocking In-App Modals:** Replaced native browser `window.confirm` (which is blocked or suppressed in modern browsers/PWAs) with sleek, unblockable dark-zinc confirmation modals for destructive directives (End Event and Reset).
  - **Global WebSocket Synchronization:** Game status changes broadcast globally across `game:status_changed` and `game:status` to all connected screens (Command Desk, Live Field Radar, Participant HUD, and Spectator displays) with full timing payloads.
  - **Field Action Enforcement:** When paused or ended, participant clue submissions, hint reveals, and GPS checkpoint unlocks are strictly rejected with tactical freeze notices; participant HUDs display a prominent pulsating pause/concluded banner.
- [x] Docker multi-stage containerization, Caddy SSL automation, and EC2 documentation.
