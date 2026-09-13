# Nudge — Developer Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js v22+** (managed via [fnm](https://github.com/Schniz/fnm) on this machine)
- **pnpm v12+** — the package manager for this monorepo

### Verify your setup

```powershell
node --version   # should show v22.x.x
pnpm --version   # should show 12.x.x
```

---

## What is pnpm?

pnpm is a fast, disk-efficient package manager. Unlike npm/yarn, it stores packages in a single content-addressable store on your machine and creates hard links instead of copying files. This means:

- Installing is **faster** after the first install (packages are reused from the store)
- **Disk usage is minimal** — 10 projects using React share one copy of React on disk
- **Workspace support is built-in** — monorepo packages can reference each other directly

---

## Monorepo Structure

```
nudge/                          ← monorepo root (run pnpm commands here)
├── apps/
│   ├── api/                    ← NestJS backend (@nudge/api)
│   └── web/                    ← Next.js frontend (@nudge/web)
└── packages/
    └── shared/                 ← Shared TypeScript types (@nudge/shared)
```

The `pnpm-workspace.yaml` at the root tells pnpm that all directories under `apps/` and `packages/` are workspace packages.

---

## Getting Started

### 1. Clone and install

```powershell
git clone <repo-url>
cd nudge
pnpm install
```

This installs all dependencies for all 4 workspace projects at once.

### 2. Set up environment variables

```powershell
# Copy the example files
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Then fill in the required values in both files. See the [Environment Variables](#environment-variables) section below.

### 3. Set up the database

```powershell
# Run migrations against your Neon database
pnpm prisma:migrate
```

### 4. Start development

```powershell
# Terminal 1 — NestJS API (http://localhost:3001)
pnpm dev:api

# Terminal 2 — Next.js web (http://localhost:3000)
pnpm dev:web
```

---

## Essential pnpm Commands

### Running scripts

| What you want to do | Command |
|---|---|
| Start the API in dev mode | `pnpm dev:api` |
| Start the web in dev mode | `pnpm dev:web` |
| Build the API | `pnpm build:api` |
| Build the web | `pnpm build:web` |
| Run linting everywhere | `pnpm lint` |

### Managing packages

| What you want to do | Command |
|---|---|
| Add a package to the **API** | `pnpm add <pkg> --filter @nudge/api` |
| Add a package to the **web** | `pnpm add <pkg> --filter @nudge/web` |
| Add a package to **shared** | `pnpm add <pkg> --filter @nudge/shared` |
| Add a **dev** dependency to the API | `pnpm add -D <pkg> --filter @nudge/api` |
| Add a package to **all** workspaces | `pnpm add <pkg> -r` |
| Remove a package | `pnpm remove <pkg> --filter @nudge/api` |
| Install all dependencies (after git pull) | `pnpm install` |

### Prisma commands

| What you want to do | Command |
|---|---|
| Create a new migration | `pnpm prisma:migrate` |
| Open Prisma Studio (DB browser) | `pnpm prisma:studio` |
| Regenerate Prisma client | `pnpm prisma:generate` |
| Run migrations in production | `pnpm --filter @nudge/api prisma migrate deploy` |

> **Note:** All Prisma commands are run from the **monorepo root**, not from `apps/api`. The root `package.json` scripts handle the `--filter` flag for you.

---

## How workspace references work

The `@nudge/shared` package is referenced in both `apps/api` and `apps/web` via:

```json
"@nudge/shared": "workspace:*"
```

This means TypeScript resolves `import { DetectedEventDto } from '@nudge/shared'` directly to the source files in `packages/shared/src/` — no build step required. Changes to shared types are immediately reflected in both apps.

---

## Environment Variables

### `apps/api/.env`

| Variable | Description | Where to get it |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | [neon.tech](https://neon.tech) |
| `JWT_SECRET` | 64-char random string for signing JWTs | `openssl rand -hex 64` |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) for token encryption | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Same as above |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI | `http://localhost:3001/auth/google/callback` |
| `GEMINI_API_KEY` | Gemini AI API key | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `AI_CONFIDENCE_THRESHOLD` | Minimum confidence to surface an event | `0.75` (default) |
| `REDIS_URL` | Upstash Redis TLS URL | [upstash.com](https://upstash.com) |
| `RESEND_API_KEY` | Resend email API key | [resend.com](https://resend.com) |
| `RESEND_FROM_EMAIL` | Verified sender email address | Your verified Resend domain |
| `VAPID_PUBLIC_KEY` | Web Push public key | Generate (see below) |
| `VAPID_PRIVATE_KEY` | Web Push private key | Generate (see below) |
| `VAPID_SUBJECT` | Contact email for push | `mailto:you@example.com` |

### Generating VAPID keys

```powershell
# From the monorepo root
node -e "const wp = require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys(), null, 2))"
```

### `apps/web/.env.local`

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL (`http://localhost:3001` for local dev) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same VAPID public key as above |

---

## Google Cloud Console Setup

You need a Google Cloud project with the following APIs enabled:

1. **Gmail API**
2. **Google Calendar API**
3. **Google+ API** (for OAuth profile info)

### OAuth Scopes requested

- `email` — user's email address (login)
- `profile` — user's name and avatar
- `https://www.googleapis.com/auth/gmail.readonly` — read Gmail messages
- `https://www.googleapis.com/auth/calendar.events` — create/delete Calendar events

### Authorized redirect URIs

Add these in the Google Cloud Console under your OAuth 2.0 credentials:

- `http://localhost:3001/auth/google/callback` (local development)
- `https://your-render-api-url.onrender.com/auth/google/callback` (production)

---

## Common Issues

### `pnpm` not found after opening a new terminal

pnpm was installed globally via npm, but fnm manages Node.js so the PATH may not be set. Fix:

```powershell
# This runs automatically once fnm is properly set up in your PowerShell profile
# If it doesn't work, manually run:
fnm use 22
```

### `ERR_PNPM_IGNORED_BUILDS`

pnpm v12 requires explicit approval for packages that run build scripts. Run:

```powershell
pnpm approve-builds --all
```

This is already configured in `package.json` under `pnpm.approvedBuilds` for the known packages.

### Port already in use

```powershell
# Kill whatever is on port 3001
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

---

## What gets stored in Git

- ✅ Source code in `apps/` and `packages/`
- ✅ `pnpm-lock.yaml` — always commit this (ensures reproducible installs)
- ✅ `.env.example` files
- ❌ `node_modules/` — never commit
- ❌ `.env` and `.env.local` — never commit (contains secrets)
- ❌ `.next/` and `dist/` — build outputs
