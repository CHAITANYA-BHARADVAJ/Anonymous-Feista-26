# 🚀 AWS EC2 Deployment Guide — SDMCET Campus Hunt

This guide explains how to deploy the **Anonymous SDMCET Campus Hunt** application to an AWS EC2 instance using **Docker Compose** and **Caddy** with automated **HTTPS / SSL** (via `nip.io` or a custom domain).

---

## 📋 Step 1: Launch your AWS EC2 Instance

1. Log into your **AWS Management Console** → Go to **EC2** → Click **Launch Instance**.
2. **Name**: `Campus-Hunt-Server`
3. **OS**: **Ubuntu Server 24.04 LTS** (or 22.04 LTS) — 64-bit (x86_64).
4. **Instance Type**:
   - `t3.small` (2 vCPU, 2 GB RAM) is recommended for 25–100+ simultaneous teams.
5. **Key pair**: Select or create an SSH key pair (`.pem`) to connect.
6. **Network Settings (Security Group)**:
   Ensure the following inbound ports are open:
   - **Port 22 (SSH)** — Source: `My IP`
   - **Port 80 (HTTP)** — Source: `0.0.0.0/0` (Needed for Caddy Let's Encrypt challenge)
   - **Port 443 (HTTPS)** — Source: `0.0.0.0/0` (Needed for secure GPS geolocation)
7. Click **Launch Instance** and note your **Public IPv4 Address** (e.g. `13.126.101.127`).

---

## 💻 Step 2: Connect to your EC2 Instance

From your terminal (Mac/Linux) or PowerShell (Windows):
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

---

## 🐳 Step 3: Install Docker & Docker Compose on Ubuntu

Run this single command on your EC2 instance to install Docker and Docker Compose:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
```
Log out and log back in (or run `newgrp docker`) so your user can run docker without `sudo`.

---

## 📥 Step 4: Clone the Repository & Configure Production Secrets

```bash
# Clone the repository
git clone https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26.git
cd Anonymous-Feista-26

# Create your .env file
cp .env.example .env
```

Generate a strong JWT secret on EC2:
```bash
openssl rand -hex 32
```

Now open `.env` using `nano`:
```bash
nano .env
```
Update the required variables:
```env
DOMAIN=13.126.101.127.nip.io
ACME_EMAIL=your-email@gmail.com
JWT_SECRET=<paste-64-char-hex-from-openssl>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-unique-password-at-least-8-chars>
FORCE_SEED=false
```
*(Important: Production boot strictly rejects missing/default `JWT_SECRET` or weak `ADMIN_PASSWORD` values such as `admin123`.)*

If you have a custom domain (e.g., `hunt.anonymoussdmcet.in`), point an **A record** to your EC2 IP and set `DOMAIN=hunt.anonymoussdmcet.in`.

---

## 🚀 Step 5: Start the Application with Docker Compose

Run:
```bash
docker compose up -d --build
```

Docker will:
1. Compile both the Vite React PWA and Express TypeScript backend.
2. Back up any existing `/data/dev.db` into `/data/backups/` and run non-destructive Prisma migrations (`prisma migrate deploy`).
3. Seed default SDMCET campus targets, shared Clue Pool, and demo teams when initializing a fresh DB.
4. Wait until `/api/v1/health` reports healthy (`db: ok`), then start Caddy to configure trusted HTTPS.

Verify health and containers:
```bash
docker compose ps
curl -fsS https://<YOUR_DOMAIN>/api/v1/health
```
Expected response: `{"ok":true,"db":"ok","uptimeSecs":...}`.

---

## 🎯 Step 6: Access your Live Event Portal

Open your mobile browser or laptop:
- **Participant Portal**: `https://<YOUR_DOMAIN>/login`
- **Squad Registration**: `https://<YOUR_DOMAIN>/register`
- **Admin Command Desk**: `https://<YOUR_DOMAIN>/admin/login`
- **Live Spectator Board**: `https://<YOUR_DOMAIN>/spectator`

---

## 💾 SQLite Backups & Maintenance Commands

Automatic pre-migration backups are written to `./data/backups/` on container boot (retaining the latest 5 snapshots). To take a manual live backup safely without stopping the app:
```bash
docker compose exec app node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").finally(() => p.$disconnect());
'
cp ./data/dev.db "./data/backups/manual-$(date +%Y%m%d%H%M%S).db"
```

Useful operational commands:
```bash
# Check container health & status
docker compose ps

# View Node.js / Caddy logs
docker compose logs -f --tail=50 app
docker compose logs -f --tail=50 caddy

# Pull latest updates from GitHub and redeploy
git pull origin main
docker compose up -d --build
```
