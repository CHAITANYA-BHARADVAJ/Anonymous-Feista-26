# 🚀 AWS EC2 Deployment Guide — SDMCET Campus Hunt

This guide explains how to deploy the **Anonymous SDMCET Campus Hunt** application to an AWS EC2 instance using **Docker Compose** and **Caddy** with automated **HTTPS / SSL** (via `nip.io` or a custom domain).

---

## 📋 Step 1: Launch your AWS EC2 Instance

1. Log into your **AWS Management Console** → Go to **EC2** → Click **Launch Instance**.
2. **Name**: `Campus-Hunt-Server`
3. **OS**: **Ubuntu Server 24.04 LTS** (or 22.04 LTS) — 64-bit (x86_64).
4. **Instance Type**: 
   - `t3.micro` or `t2.micro` (Free Tier eligible) is sufficient.
   - For 100+ simultaneous teams, `t3.small` (2 vCPU, 2 GB RAM) is recommended.
5. **Key pair**: Select or create an SSH key pair (`.pem`) to connect.
6. **Network Settings (Security Group)**:
   Ensure the following inbound ports are open:
   - **Port 22 (SSH)** — Source: `My IP` (or `0.0.0.0/0`)
   - **Port 80 (HTTP)** — Source: `0.0.0.0/0` (Needed for Caddy Let's Encrypt challenge)
   - **Port 443 (HTTPS)** — Source: `0.0.0.0/0` (Needed for secure GPS geolocation)
7. Click **Launch Instance** and note your **Public IPv4 Address** (e.g. `13.233.50.120`).

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

## 📥 Step 4: Clone the Repository & Configure

```bash
# Clone the repository
git clone https://github.com/CHAITANYA-BHARADVAJ/Anonymous-Feista-26.git
cd Anonymous-Feista-26

# Create your .env file
cp .env.example .env
```

Now open `.env` using `nano`:
```bash
nano .env
```
Update the `DOMAIN` variable using your **EC2 Public IP** and **nip.io**:
```env
# Example: if your EC2 public IP is 13.233.50.120:
DOMAIN=13.233.50.120.nip.io
ACME_EMAIL=your-email@gmail.com
ADMIN_PASSWORD=admin123
```
*(Tip: `nip.io` is a free public wildcard DNS. Any request to `13.233.50.120.nip.io` automatically resolves to `13.233.50.120`. Caddy will immediately issue a valid Let's Encrypt HTTPS certificate for it!)*

If you have a custom domain (e.g., `hunt.anonymoussdmcet.in`), point an **A record** to your EC2 IP and set `DOMAIN=hunt.anonymoussdmcet.in`.

Save and exit nano (`Ctrl + O`, `Enter`, `Ctrl + X`).

---

## 🚀 Step 5: Start the Application with Docker Compose

Run:
```bash
docker compose up -d --build
```

Docker will:
1. Compile both the Vite React PWA and Express TypeScript backend.
2. Launch the unified application container.
3. Automatically run database migrations and seed default SDMCET campus targets.
4. Launch Caddy to request and configure a trusted HTTPS certificate.

Check running containers:
```bash
docker compose ps
```

View live logs:
```bash
docker compose logs -f
```

---

## 🎯 Step 6: Access your Live Event Portal

Open your mobile browser or laptop:
- **Participant Portal**: `https://<YOUR_DOMAIN>/login`
  - Demo Call-signs: `Team Alpha` (code: `hunt2026`) or `Team Beta` (code: `fiesta26`)
- **Admin Command Desk**: `https://<YOUR_DOMAIN>/admin/login`
  - Credentials: `admin` / `<ADMIN_PASSWORD>`
- **Live Spectator Board**: `https://<YOUR_DOMAIN>/spectator`

> **Note on GPS:** Because the connection is served over valid `https://`, mobile Safari and Android Chrome will automatically permit high-accuracy GPS tracking across the SDMCET campus grounds!

---

## 🔄 Useful Maintenance Commands

```bash
# Stop the containers
docker compose down

# Restart the containers
docker compose restart

# View Caddy SSL logs
docker compose logs caddy

# View Node.js server logs
docker compose logs app

# Pull latest updates from GitHub and redeploy
git pull origin main
docker compose up -d --build
```
