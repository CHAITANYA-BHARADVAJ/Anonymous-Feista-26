# Campus Hunt 🎯

A mobile-first, real-time web app for a live campus OSINT scavenger hunt.  
Teams use phones to find a hidden target person using social media clues, then take a live photo with them. The first team with an admin-approved photo wins.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS (PWA) |
| Maps | Leaflet + OpenStreetMap |
| Real-time | Socket.io |
| Backend | Node.js + Express + Socket.io |
| Database | SQLite via Prisma (swap to PostgreSQL by changing `DATABASE_URL`) |
| Auth | JWT in httpOnly cookie |
| Photos | Multer (local disk) |

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+

### Setup

```bash
# 1. Clone
git clone https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26
cd Anonymous-Feista-26

# 2. Install all workspace dependencies
npm install

# 3. Copy env file and edit if needed
cp packages/server/.env.example packages/server/.env

# 4. Run database migrations
npm run db:migrate

# 5. Seed with sample data (1 game, 3 levels, 2 teams, 1 admin)
npm run db:seed

# 6. Start everything (server on :3001, client on :5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Seed credentials

| Role | Username / Team Name | Password / Code |
|---|---|---|
| Admin | `admin` | `admin123` |
| Team Alpha | `Team Alpha` | `hunt2026` |
| Team Beta | `Team Beta` | `fiesta26` |

Admin dashboard: [http://localhost:5173/admin/login](http://localhost:5173/admin/login)  
Spectator view: [http://localhost:5173/spectator](http://localhost:5173/spectator)

---

## Testing on a Real Phone (GPS + Camera require HTTPS)

GPS and camera capture only work in a secure context (HTTPS or localhost).  
To test on a real device, expose the local server through a tunnel:

```bash
# Option A — ngrok
ngrok http 5173

# Option B — Cloudflare Tunnel
cloudflared tunnel --url http://localhost:5173
```

Then update `CLIENT_URL` in `packages/server/.env` to the tunnel URL and restart.

---

## Project Structure

```
campus-hunt/
├── packages/
│   ├── server/              # Express + Socket.io + Prisma
│   │   ├── prisma/          # schema.prisma, migrations, seed.ts
│   │   └── src/
│   │       ├── routes/      # auth, games, levels, zones, participant, leaderboard, admin
│   │       ├── services/    # scoreService, timerService, zoneService
│   │       ├── socket/      # Socket.io handlers
│   │       ├── middleware/  # auth (JWT), upload (Multer)
│   │       └── lib/         # prisma client, jwt helpers
│   └── client/              # React + Vite PWA
│       └── src/
│           ├── routes/      # Login, AdminLogin, Spectator
│           │   ├── play/    # Home, Clues, MapView, Leaderboard, Profile, Camera
│           │   └── admin/   # AdminLayout, AdminGame, AdminLevels, AdminPhotos
│           ├── stores/      # Zustand: authStore, gameStore
│           ├── hooks/       # useSocket, useLocation, useCountdown
│           └── lib/         # api.ts, socket.ts
└── package.json             # Root workspace (npm run dev)
```

---

## Key Design Decisions

**Server-side scoring only** — all timestamps, penalties, and score computation happen on the server. Clients display mirrored values and cannot mutate scores.

**Adjusted time formula:**
```
adjusted_time = (finish_ts − game_start_ts − total_paused_ms)
              + hint_penalties
              + zone_penalties
              − checkpoint_bonuses
```

**Per-level timers** — scheduled with `setTimeout` server-side. On server restart, in-progress timers are rescheduled from the database.

**Location privacy** — GPS coordinates are broadcast only to the admin Socket.io room. Participant and spectator rooms never receive team positions. Location sharing stops on `game:status_changed { status: "ended" }`.

**Live photo only** — `capture="environment"` on the file input prevents gallery uploads on iOS Safari and Android Chrome.

---

## Environment Variables (`packages/server/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Prisma connection string |
| `JWT_SECRET` | — | Secret for signing JWTs (required in production) |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `admin123` | Admin login password |
| `PORT` | `3001` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin / tunnel URL |
| `UPLOAD_DIR` | `./uploads` | Photo storage directory |
| `MAX_PHOTO_SIZE_MB` | `10` | Maximum photo upload size |
