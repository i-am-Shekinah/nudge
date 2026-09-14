# Nudge — Production Deployment & Operations Guide (Oracle Cloud VM + Ubuntu)

This guide documents the production deployment architecture and operations runbook for **Nudge**.

The backend REST API and background orchestrators run on a self-managed **Ubuntu Linux virtual machine on Oracle Cloud Infrastructure (OCI)** using the **Always Free compute tier**. The application data layer utilizes managed serverless providers: **Neon** (PostgreSQL) and **Upstash** (Redis with TLS). The frontend web application is configured for **Vercel** (with self-hosting on the VM as an open evaluation).

---

## 1. Architecture Overview

```text
                           Internet
                              │
                              ▼
                      DNS / HTTPS Domain
                 (e.g., api.yourdomain.com)
                              │
                              ▼
              ┌───────────────────────────────┐
              │     Oracle Cloud (OCI) VM     │
              │       Ubuntu 22.04/24.04      │
              ├───────────────────────────────┤
              │ Reverse Proxy (Nginx / Caddy) │
              │   - Automated Let's Encrypt   │
              │   - Port 80 -> 443 Redirect   │
              │   - Upstream -> Port 3001     │
              ├───────────────────────────────┤
              │ systemd Process Supervisor    │
              │                               │
              │ ├── nudge-api.service         │
              │ │   (NestJS API on :3001)     │
              │ │                             │
              │ └── nudge-worker.service      │
              │     (BullMQ & Schedulers)     │
              └───────────────┬───────────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
     ┌───────────────┐┌───────────────┐┌───────────────┐
     │ Neon Database ││ Upstash Redis ││ External APIs │
     │ (PostgreSQL)  ││ (BullMQ Queue)││ • Google OAuth│
     │ - Connection  ││ - TLS rediss  ││ • Gmail API   │
     │   Pooling     ││ - Always-on   ││ • Calendar    │
     │ - Prisma 7    ││   event bus   ││ • Gemini 2.0  │
     │ - SSL required││               ││ • Resend / Push│
     └───────────────┘└───────────────┘└───────────────┘
```

### Why Always-On Infrastructure is Required

Nudge cannot operate reliably on sleeping/serverless compute instances (such as Render's free tier). Nudge relies on three critical time-sensitive background engines:
1. **60-Second Nightly Midnight Scan (`NightlyScanOrchestrator`)**: Runs every 60 seconds (`@Cron(CronExpression.EVERY_MINUTE)`). It evaluates users globally whose local timezone has just crossed midnight (`User.nextScanAt <= now`) and executes an automated 24-hour email lookback scan. If the instance sleeps or spins down, global users miss their midnight scan window.
2. **60-Second Morning Digest Orchestrator (`MorningNotifyOrchestrator`)**: Runs every 60 seconds to detect users whose local morning briefing hour (e.g., 07:00 AM) has arrived, dispatching digest emails via Resend and notifications via Web Push.
3. **Daily Retention Cleanup (`AutoDeleteOrchestrator`)**: Runs daily at 02:00 UTC to purge events and scan logs that have passed their 7-day retention horizon (`autoDeleteAt`).
4. **BullMQ Worker Queue**: Continuously processes background Google Calendar insertion and synchronization jobs with exponential backoff retries.

An always-on Oracle Cloud VM ensures continuous 24/7 background execution with zero cold starts.

---

## 2. Infrastructure Decisions & Status

| Architectural Component | Direction / Target | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Compute VM** | Oracle Cloud Always Free (Ubuntu Linux) | **Confirmed** | Ampere A1 (ARM64) or AMD E2.1.Micro (x86_64) |
| **Process Manager** | `systemd` (`nudge-api`, `nudge-worker`) | **Confirmed** | Replaces containerized/Render blueprint runtime |
| **Database** | Neon Serverless PostgreSQL | **Confirmed** | Retained as external managed pooled provider |
| **Queue / Cache** | Upstash Redis (TLS) | **Confirmed** | Retained as external managed serverless Redis |
| **Reverse Proxy** | Nginx (with Certbot Let's Encrypt) | **Intended** | Caddy is an approved lightweight alternative |
| **Frontend Hosting** | Vercel (Next.js 15 App Router) | **Interim / Pending** | Current repository has `apps/web/vercel.json`; self-hosting on VM remains an open option |
| **CI/CD Pipeline** | GitHub Actions / SSH Deploy Script | **Pending Decision** | Manual deployment runbook documented below for Phase 1 |
| **Monitoring / Logging**| `journalctl` + Uptime Kuma / healthchecks | **Pending Decision** | Basic systemd logging configured initially |
| **Render Blueprint** | `render.yaml` | **Legacy** | To be decommissioned in Phase 2 |

---

## 3. Prerequisites

Before provisioning, verify the following prerequisites:

### 1. Accounts & Compute
- **Oracle Cloud Infrastructure (OCI) Account**:
  - Eligible for **Always Free** tier resources.
  - Recommended shape: **VM.Standard.A1.Flex** (Ampere ARM64, up to 4 OCPUs and 24 GB RAM free) or **VM.Standard.E2.1.Micro** (AMD x86_64, 1 OCPU, 1 GB RAM).
  - Operating System: **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.
- **Domain & DNS Control**:
  - Access to manage DNS records for your domain (e.g., `api.nudge.yourdomain.com`).
  - Ability to create an `A` record pointing to the OCI instance's public IP address.

### 2. Runtime & Tooling (Repository Engines)
- **Node.js**: `>= 22.0.0` (as specified in root [package.json](file:///c:/Users/Shekinah/Dev/moi/nudge/package.json#L25)).
- **pnpm**: `>= 12.0.0` (as specified in root [package.json](file:///c:/Users/Shekinah/Dev/moi/nudge/package.json#L26)).
- **Git**: Installed on server for repository checkout.

### 3. Managed Services & Credentials
- **Neon PostgreSQL**: Pooled database connection string with SSL mode required (`postgresql://...?sslmode=require`).
- **Upstash Redis**: Serverless Redis endpoint starting with `rediss://` (TLS required).
- **Google Cloud Console OAuth 2.0 Credentials**:
  - Enabled APIs: **Gmail API** (`https://www.googleapis.com/auth/gmail.readonly`), **Google Calendar API** (`https://www.googleapis.com/auth/calendar.events`).
  - Authorized Redirect URI: `https://api.yourdomain.com/auth/google/callback`.
  - Authorized JavaScript Origin: `https://app.yourdomain.com` (or Vercel URL).
- **Google AI Studio**: Gemini API key for `gemini-2.0-flash`.
- **Resend**: API key and verified sending domain for transactional morning briefings.
- **Web Push (VAPID)**: Generated public/private keypair and contact mailto URI.

---

## 4. Server Setup Runbook (Ubuntu on Oracle Cloud)

### Step 4.1 — Provision OCI Compute Instance
1. In the OCI Console, navigate to **Compute** → **Instances** → **Create Instance**.
2. **Image**: Ubuntu 22.04 or 24.04 Minimal/Standard.
3. **Shape**:
   - Preferred: `VM.Standard.A1.Flex` (e.g., 2 OCPUs, 12 GB RAM, Always Free).
   - Alternative: `VM.Standard.E2.1.Micro` (1 OCPU, 1 GB RAM).
4. **Networking**:
   - Assign a **Public IPv4 address**.
   - Note the Virtual Cloud Network (VCN) and subnet.
5. **SSH Keys**: Upload your public SSH key (`id_ed25519.pub` or `id_rsa.pub`).
6. Click **Create** and wait for the instance state to become `RUNNING`.

### Step 4.2 — Configure OCI Virtual Cloud Network (VCN) Firewall
By default, Oracle Cloud VCNs drop incoming traffic on ports other than 22.
1. Navigate to **Networking** → **Virtual Cloud Networks** → Select your VCN.
2. Under **Security Lists**, select **Default Security List for [your-vcn]**.
3. Under **Ingress Rules**, click **Add Ingress Rules**:
   - **HTTP Rule**: Source `0.0.0.0/0`, IP Protocol `TCP`, Destination Port Range `80`, Description `Allow HTTP for Let's Encrypt and redirect`.
   - **HTTPS Rule**: Source `0.0.0.0/0`, IP Protocol `TCP`, Destination Port Range `443`, Description `Allow HTTPS traffic`.
4. Click **Add Ingress Rules**.

### Step 4.3 — Connect via SSH and Update System
Connect to the server using the default `ubuntu` user:
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@<YOUR_OCI_PUBLIC_IP>
```

Update system packages:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential
```

### Step 4.4 — Configure Ubuntu Host Firewall (UFW & iptables)
> [!NOTE]
> Oracle Linux/Ubuntu images in OCI include existing `iptables` rules. Ensure both `iptables` and `ufw` permit traffic on ports 22, 80, and 443.

```bash
# Allow essential ports in UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

# Check status
sudo ufw status verbose
```

### Step 4.5 — Create Dedicated Application User
Run application processes under a dedicated service user rather than `root`:
```bash
sudo adduser --system --group --shell /bin/bash --home /home/nudge nudge
sudo usermod -aG sudo nudge

# Copy authorized SSH keys to the nudge user for direct deployment access
sudo mkdir -p /home/nudge/.ssh
sudo cp /home/ubuntu/.ssh/authorized_keys /home/nudge/.ssh/
sudo chown -R nudge:nudge /home/nudge/.ssh
sudo chmod 700 /home/nudge/.ssh
sudo chmod 600 /home/nudge/.ssh/authorized_keys
```

### Step 4.6 — Install Node.js v22 and pnpm v12
Switch to the `nudge` user:
```bash
sudo -u nudge -i
```

Install Node.js v22 using NodeSource or `fnm` (Fast Node Manager):
```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Activate fnm in current shell
source ~/.bashrc

# Install and use Node.js 22 LTS
fnm install 22
fnm default 22

# Verify version
node --version   # Must output v22.x.x

# Install pnpm v12 globally
npm install -g pnpm@latest
pnpm --version   # Must output >= 12.0.0
```

### Step 4.7 — Clone Repository and Install Dependencies
Still logged in as `nudge`:
```bash
cd /home/nudge
git clone https://github.com/yourusername/nudge.git app
cd app

# Install dependencies with frozen lockfile
pnpm install --frozen-lockfile

# Approve native build scripts if prompted by pnpm v12
pnpm approve-builds --all
```

---

## 5. Environment Variables Audit & Configuration

Audit based directly on [apps/api/.env.example](file:///c:/Users/Shekinah/Dev/moi/nudge/apps/api/.env.example) and code references across `apps/api/src/`.

### Backend Environment Variables (`apps/api/.env`)

Create the production environment file:
```bash
cp /home/nudge/app/apps/api/.env.example /home/nudge/app/apps/api/.env
chmod 600 /home/nudge/app/apps/api/.env
nano /home/nudge/app/apps/api/.env
```

| Variable | Required | Purpose | Where Obtained / Specification |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | Specifies runtime mode (`production`) | Set to `production` |
| `PORT` | **Yes** | Internal listening port for NestJS HTTP server | Set to `3001` (Nginx proxies to this port) |
| `FRONTEND_URL` | **Yes** | Target URL for browser redirects and dashboard links in emails | `https://app.yourdomain.com` or Vercel URL |
| `DATABASE_URL` | **Yes** | Neon pooled PostgreSQL connection string with SSL | [Neon Console](https://neon.tech) (`postgresql://...?sslmode=require`) |
| `JWT_SECRET` | **Yes** | 64-character secret for signing user session JWTs | Generate via: `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | No | JWT expiration duration (defaults to `7d`) | `7d` |
| `ENCRYPTION_KEY` | **Yes** | Exactly 64-hex-character (32-byte) key for AES-256-GCM token crypto | Generate via: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | **Yes** | Google Cloud OAuth 2.0 Web Client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | **Yes** | Google Cloud OAuth 2.0 Web Client Secret | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CALLBACK_URL` | **Yes** | OAuth redirect URI registered in Google Console | `https://api.yourdomain.com/auth/google/callback` |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio API key for Gemini 2.0 Flash classification | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `AI_CONFIDENCE_THRESHOLD` | No | Classification acceptance threshold (defaults to `0.75` in env / `0.7` in schema) | `0.75` |
| `REDIS_URL` | **Yes** | Upstash serverless Redis connection string with TLS | [Upstash Console](https://upstash.com) (`rediss://...`) |
| `RESEND_API_KEY` | **Yes** | API key for transactional email dispatches | [Resend Console](https://resend.com) (`re_...`) |
| `RESEND_FROM_EMAIL` | **Yes** | Sender email address from verified sending domain | E.g. `nudge@yourdomain.com` or `digest@nudge.app` |
| `VAPID_PUBLIC_KEY` | **Yes** | Public key for browser Web Push notifications | Generated via `web-push` CLI or Node script |
| `VAPID_PRIVATE_KEY` | **Yes** | Private key for browser Web Push notifications | Generated via `web-push` CLI or Node script |
| `VAPID_SUBJECT` | **Yes** | Contact email address for push delivery identification | `mailto:support@yourdomain.com` |

### Frontend Environment Variables (`apps/web/.env.local`)

| Variable | Required | Purpose | Where Obtained / Specification |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | **Yes** | Public URL of the backend API reverse proxy | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **Yes** | VAPID public key matching the backend | Matches `VAPID_PUBLIC_KEY` from backend |

> [!CAUTION]
> Never commit `.env` files to Git. Ensure file permissions on the server are restricted with `chmod 600 /home/nudge/app/apps/api/.env`.

---

## 6. Database & Prisma Operations

Nudge utilizes Prisma 7 with the `@prisma/adapter-pg` driver adapter.

### Step 6.1 — Generate Prisma Client
Whenever the schema is updated or dependencies are installed, generate the Prisma Client:
```bash
cd /home/nudge/app
pnpm prisma:generate
```

### Step 6.2 — Apply Database Schema Migrations
For production databases on Neon:
```bash
# If using Prisma migration history:
pnpm --filter @nudge/api exec prisma migrate deploy

# If synchronizing directly with schema:
pnpm --filter @nudge/api exec prisma db push
```

> [!IMPORTANT]
> **Safe Deployment Order**:
> 1. Run Prisma database migrations first.
> 2. Build backend application bundles.
> 3. Restart application services (`systemctl restart nudge-api nudge-worker`).

---

## 7. Process Management with systemd

Instead of running inside containers or temporary shell sessions, the backend runs continuously under Ubuntu's native `systemd` supervisor.

### Service Topology

```text
systemd
 ├── nudge-api.service    ──> NestJS HTTP Server (:3001)
 └── nudge-worker.service ──> Background Schedulers & Queue Engine
```

> [!NOTE]
> In the current codebase, `apps/api/dist/main.js` boots both the HTTP listener and the `@nestjs/schedule` orchestrators. In Phase 1, `nudge-api.service` manages the primary monolithic process. In Phase 2, a dedicated worker entrypoint can be split to run independently under `nudge-worker.service`. Both service templates are provided below.

### Step 7.1 — Create `nudge-api.service`
Create `/etc/systemd/system/nudge-api.service`:
```ini
[Unit]
Description=Nudge Backend API Service
After=network.target

[Service]
Type=simple
User=nudge
Group=nudge
WorkingDirectory=/home/nudge/app
Environment=NODE_ENV=production
Environment=PORT=3001
EnvironmentFile=/home/nudge/app/apps/api/.env
ExecStart=/home/nudge/.fnm/current/bin/node /home/nudge/app/apps/api/dist/main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nudge-api

# Hardening & limits
LimitNOFILE=65536
MemoryMax=1G

[Install]
WantedBy=multi-user.target
```

### Step 7.2 — Create `nudge-worker.service` (For Phase 2 Split)
Create `/etc/systemd/system/nudge-worker.service`:
```ini
[Unit]
Description=Nudge Background Worker & Scheduler
After=network.target nudge-api.service

[Service]
Type=simple
User=nudge
Group=nudge
WorkingDirectory=/home/nudge/app
Environment=NODE_ENV=production
EnvironmentFile=/home/nudge/app/apps/api/.env
# In Phase 2, this can target a dedicated worker entrypoint (e.g., dist/worker.js)
ExecStart=/home/nudge/.fnm/current/bin/node /home/nudge/app/apps/api/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nudge-worker

[Install]
WantedBy=multi-user.target
```

### Step 7.3 — Enable and Start Services
```bash
sudo systemctl daemon-reload
sudo systemctl enable nudge-api.service
sudo systemctl start nudge-api.service

# Verify status
sudo systemctl status nudge-api.service
```

---

## 8. Reverse Proxy & HTTPS Configuration (Nginx + Certbot)

### Step 8.1 — Install Nginx & Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step 8.2 — Configure DNS Record
Create an `A` record in your DNS provider:
- **Name**: `api` (resolving to `api.yourdomain.com`)
- **Type**: `A`
- **Value**: `<YOUR_OCI_PUBLIC_IP>`
- **TTL**: 300 (or automatic)

### Step 8.3 — Nginx Server Block Configuration
Create `/etc/nginx/sites-available/nudge-api`:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Maximum request body size for metadata payloads
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/nudge-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8.4 — Issue Let's Encrypt TLS Certificate
Obtain and configure TLS certificates automatically:
```bash
sudo certbot --nginx -d api.yourdomain.com
```
Select the option to automatically redirect all HTTP traffic to HTTPS.

Verify automatic certificate renewal:
```bash
sudo certbot renew --dry-run
```

---

## 9. Google Cloud OAuth & Redirect URI Configuration

Update your Google Cloud Console credentials to authorize the new production domain:
1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Select your **Nudge OAuth 2.0 Client ID**.
3. Under **Authorized JavaScript origins**, add:
   - `https://app.yourdomain.com` (your production frontend domain)
   - `https://api.yourdomain.com`
4. Under **Authorized redirect URIs**, add:
   - `https://api.yourdomain.com/auth/google/callback`
   *(Keep `http://localhost:3001/auth/google/callback` for local development).*
5. Click **Save**.

---

## 10. Background Processing & Schedulers Deep-Dive

Because Nudge operates on an always-on VM, all background jobs execute reliably:

### 1. Nightly Scan Engine (`NightlyScanOrchestrator`)
- **Schedule**: Every 60 seconds (`* * * * *`).
- **Logic**: Queries `User.findMany` where `gmailConnected = true` and `nextScanAt <= now`.
- **Double-Scan Prevention**: Immediately advances `nextScanAt` to tomorrow's midnight before triggering the scan pipeline asynchronously.
- **Window**: Scans a 24-hour lookback window (`windowStart` to `windowEnd`) for detected events.

### 2. Morning Briefing Orchestrator (`MorningNotifyOrchestrator`)
- **Schedule**: Every 60 seconds (`* * * * *`).
- **Logic**: Checks users where `nextNotifyAt <= now` (matched to user's selected morning notification time, e.g. `07:00`).
- **Dispatch**: Dispatches pending event summaries via Resend (HTML email) and Web Push (VAPID) if pending events exist.

### 3. Data Retention Auto-Purge (`AutoDeleteOrchestrator`)
- **Schedule**: Daily at 02:00 UTC (`0 2 * * *`).
- **Logic**: Sweeps and deletes `DetectedEvent` records where `autoDeleteAt <= now` and status is `COMPLETED`, `EXPIRED`, or `IGNORED`.

### 4. BullMQ & Redis Queue
- **Engine**: BullMQ with Upstash Redis connection.
- **Queue Responsibilities**: Async Google Calendar event creation, rate-limit throttling against Google API quotas, and exponential backoff retry handling (3 attempts before marking `ERROR`).

---

## 11. Production Operations Runbook

### Deploying an Application Update
When deploying code changes to the production VM:
```bash
sudo -u nudge -i
cd /home/nudge/app

# 1. Fetch latest changes
git pull origin main

# 2. Install dependencies (if lockfile changed)
pnpm install --frozen-lockfile

# 3. Apply any database migrations
pnpm --filter @nudge/api exec prisma migrate deploy

# 4. Re-generate Prisma client & rebuild API
pnpm prisma:generate
pnpm build:api

# 5. Restart application service
sudo systemctl restart nudge-api.service
```

### Inspecting Service Logs
```bash
# Follow real-time logs for the API service
journalctl -u nudge-api -f

# View the last 200 lines of logs
journalctl -u nudge-api -n 200 --no-pager

# View error logs specifically
journalctl -u nudge-api -p err -n 100
```

### Monitoring Host Health & Resources
```bash
# Check CPU and memory usage
htop

# Check memory status
free -h

# Check disk space
df -h /

# Check active listening ports
sudo ss -tulpn | grep -E ':(80|443|3001)'
```

### Rollback Procedure
If a release causes runtime regressions:
```bash
sudo -u nudge -i
cd /home/nudge/app

# Checkout previous stable commit/tag
git checkout <PREVIOUS_STABLE_COMMIT_HASH>

# Rebuild and restart
pnpm install --frozen-lockfile
pnpm build:api
sudo systemctl restart nudge-api.service
```

---

## 12. Security Checklist

- [ ] **SSH Hardening**: Ensure `/etc/ssh/sshd_config` has `PasswordAuthentication no` and `PermitRootLogin no`.
- [ ] **Firewall**: Only ports 22, 80, and 443 are exposed publicly. Port 3001 must remain bound to `127.0.0.1` and blocked from external ingress.
- [ ] **Restricted Credentials**: `.env` is readable only by the `nudge` user (`chmod 600`).
- [ ] **TLS Everywhere**: All HTTP traffic is permanently redirected to HTTPS with HSTS enabled.
- [ ] **Token Encryption**: `ENCRYPTION_KEY` is kept secure; tokens in Neon database are encrypted using AES-256-GCM.
- [ ] **Least Privilege**: Application runs as unprivileged `nudge` system user, not `root`.

---

## 13. Render Decommissioning & Phase 2 Migration Plan

### Inventory of Render References

| File / Location | Current Role | Migration Action (Phase 2) |
| :--- | :--- | :--- |
| `render.yaml` (Root) | Render Blueprint defining `nudge-api` service | **Retain in Phase 1**; delete in Phase 2 after OCI deployment is verified |
| `docs/DEPLOYMENT_GUIDE.md` | Previous Render deployment guide | **Updated** in this phase to document Oracle Cloud Ubuntu VM architecture |
| `README.md` | Badges, architecture diagrams, and deployment summary | **Updated** in this phase to reflect OCI Always Free deployment |
| Render Web Dashboard | Hosted `nudge-api` web service | Decommission and delete service after DNS switchover |

### Phase 2 Execution Checklist

- [ ] **1. Provision Oracle Cloud VM** (Ampere A1 or AMD Micro on Always Free tier).
- [ ] **2. Configure OCI Security Lists** (Permit ingress on TCP ports 22, 80, 443).
- [ ] **3. Hardening Ubuntu OS** (UFW firewall, deploy user `nudge`, SSH key configuration).
- [ ] **4. Install Runtime Environment** (fnm, Node.js v22 LTS, pnpm v12).
- [ ] **5. Clone Repository & Install Dependencies** (`pnpm install --frozen-lockfile`).
- [ ] **6. Configure Production `.env`** on server with `chmod 600`.
- [ ] **7. Run Prisma Migrations** (`pnpm --filter @nudge/api exec prisma migrate deploy` or `prisma db push`).
- [ ] **8. Build API** (`pnpm build:api`).
- [ ] **9. Install and Start `systemd` Service** (`nudge-api.service`).
- [ ] **10. Configure Nginx Reverse Proxy** (Proxy upstream to port 3001).
- [ ] **11. Provision TLS Certificate** (Certbot Let's Encrypt for `api.yourdomain.com`).
- [ ] **12. Update Google Cloud OAuth Credentials** (Authorized origins and redirect URI).
- [ ] **13. Update Frontend `NEXT_PUBLIC_API_URL`** (Point to `https://api.yourdomain.com`).
- [ ] **14. End-to-End Verification**:
  - [ ] Google OAuth login flow.
  - [ ] Onboarding backfill scan execution.
  - [ ] Event approval and Google Calendar sync.
  - [ ] Midnight scan orchestrator tick verification.
  - [ ] Morning digest dispatch verification.
- [ ] **15. Decommission Render**:
  - [ ] Suspend and delete Render service.
  - [ ] Remove `render.yaml` from repository.
