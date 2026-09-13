# Nudge — Production Deployment & Operations Guide

This guide walks you through deploying Nudge to production using **Render** (for the NestJS API and background scheduler) and **Vercel** (for the Next.js frontend), backed by **Neon** (serverless PostgreSQL) and **Upstash** (Redis).

---

## Architecture Overview

```
                        ┌───────────────────────────────┐
                        │       Vercel (Next.js)        │
                        │    https://app.nudge.com      │
                        └───────────────┬───────────────┘
                                        │ (JWT Bearer Auth)
                                        ▼
                        ┌───────────────────────────────┐
                        │      Render Starter Web       │
                        │    https://api.nudge.com      │
                        │  (NestJS + 1-Min Cron Engine) │
                        └───────┬───────────────┬───────┘
                                │               │
                ┌───────────────┴────┐     ┌────┴──────────────┐
                ▼                    ▼     ▼                   ▼
         Neon PostgreSQL       Upstash Redis   Google APIs        Gemini 2.0
       (Prisma Migrations)       (BullMQ)     (Gmail/Calendar)  (AI Extraction)
```

---

## Step 1 — Database Setup (Neon)

1. Create an account at [Neon.tech](https://neon.tech).
2. Create a new PostgreSQL database project named `nudge-production`.
3. Copy your pooled connection string:
   ```env
   DATABASE_URL="postgresql://[user]:[password]@[endpoint]-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```
4. Run migrations from your terminal:
   ```powershell
   pnpm --filter @nudge/api exec prisma db push
   ```

---

## Step 2 — Redis Setup (Upstash)

1. Create a serverless Redis database at [Upstash](https://upstash.com).
2. Copy the TLS Redis connection URL:
   ```env
   REDIS_URL="rediss://default:[password]@[endpoint].upstash.io:6379"
   ```

---

## Step 3 — Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create or select your project.
3. Enable APIs:
   - **Gmail API**
   - **Google Calendar API**
4. Configure OAuth Consent Screen:
   - User Type: External
   - Scopes:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
5. Create OAuth 2.0 Web Application Credentials:
   - Authorized JavaScript origins:
     - `https://app.nudge.com` (Vercel domain)
     - `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://api.nudge.com/auth/google/callback` (Render domain)
     - `http://localhost:3001/auth/google/callback`

---

## Step 4 — Deploy Backend (Render)

1. Connect your repository to [Render](https://render.com).
2. Click **New +** → **Blueprint** and select `render.yaml` from the root directory.
3. Choose the **Starter plan ($7/mo)**:
   > ⚠️ **Important:** Do NOT use the free tier. Render free tier instances spin down after inactivity, which will cause the every-minute midnight scan cron to miss users in different timezones.
4. Set the environment variables in the Render Dashboard:
   - `DATABASE_URL` = your Neon connection string
   - `ENCRYPTION_KEY` = 64-character hex string (run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `JWT_SECRET` = random 64-char string
   - `FRONTEND_URL` = `https://your-app.vercel.app`
   - `GOOGLE_CLIENT_ID` = your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET` = your Google OAuth Client Secret
   - `GOOGLE_CALLBACK_URL` = `https://your-api.onrender.com/auth/google/callback`
   - `GEMINI_API_KEY` = your Google AI Studio API key
   - `RESEND_API_KEY` = your Resend API key
   - `REDIS_URL` = your Upstash Redis URL

---

## Step 5 — Deploy Frontend (Vercel)

1. Import your repository into [Vercel](https://vercel.com).
2. Set **Root Directory** to `apps/web`.
3. Set **Framework Preset** to `Next.js`.
4. Configure Environment Variables:
   - `NEXT_PUBLIC_API_URL` = `https://your-api.onrender.com`
5. Click **Deploy**.

---

## Step 6 — Smoke Test Checklist

After deployment, perform these manual verification checks:

- [ ] **Google Sign-In:** Click "Continue with Google" on the landing page, authenticate with your Google account, and ensure you are redirected to `/onboarding`.
- [ ] **Initial 7-Day Backfill:** Watch the onboarding radar scan through recent emails and report emails scanned.
- [ ] **Event Detection:** Check the dashboard (`/dashboard`) to verify that upcoming events or invites are categorized with high confidence and shown as Pending Nudges.
- [ ] **Approve Event:** Click "Add to Google Calendar" and verify that the event appears on your Google Calendar with custom reminders (`3 days, 1 day, 1 hour, 30 mins, 5 mins`).
- [ ] **Dismiss & Restore:** Dismiss an event, verify it moves to `/dashboard/dismissed`, and click "Restore to Pending" to verify it returns to your dashboard.
- [ ] **Undo Approval:** On `/dashboard/history`, click "Undo Approval" and verify the Google Calendar event is deleted and the event returns to Pending.
- [ ] **Schedule Settings:** Go to `/settings`, verify your timezone and notification time are saved, and customize reminder intervals.
