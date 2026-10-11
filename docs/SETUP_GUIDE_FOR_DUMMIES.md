Here is the complete guide to generating or obtaining every environment variable for both [apps/api/.env](file:///c:/Users/Shekinah/Dev/moi/nudge/apps/api/.env) and [apps/web/.env.local](file:///c:/Users/Shekinah/Dev/moi/nudge/apps/web/.env.local).

---

### Step 1: Copy the Template Files

In your PowerShell terminal:
```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

---

### Step 2: Keys You Can Generate Locally (No Account Needed)

Since you are running Windows with Node.js installed, you can generate your secrets directly in PowerShell without installing OpenSSL:

#### 1. `JWT_SECRET` (Auth token signing)
Generate a 64-character random hex string:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2. `ENCRYPTION_KEY` (AES-256 token encryption)
Must be **exactly 64 hex characters** (32 bytes):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY` (Web Push Notifications)
Run this command from `apps/api`:
```powershell
node -e "const wp = require('web-push'); console.log(wp.generateVAPIDKeys())"
```
This outputs:
```json
{
  "publicKey": "...",
  "privateKey": "..."
}
```
* Put `publicKey` into `VAPID_PUBLIC_KEY` (in `apps/api/.env`) **and** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (in `apps/web/.env.local`).
* Put `privateKey` into `VAPID_PRIVATE_KEY` (in `apps/api/.env`).
* Set `VAPID_SUBJECT=mailto:yourname@domain.com` (use your own contact email).

---

### Step 3: Keys from External Services

#### 4. `DATABASE_URL` — [Neon PostgreSQL](https://neon.tech)

> **Skip this step for day-to-day local development.** Local dev now uses a local PostgreSQL 16 database (see `DEVELOPER_GUIDE.md`, step 3). Only follow the Neon instructions below for production, or when you specifically want real data locally.

1. Sign up or log into **Neon**.
2. Create a project named `nudge`.
3. Under **Dashboard > Connection Details**, select:
   * Role / Database: your default database
   * Check **"Pooled connection"** (recommended for serverless)
4. Copy the connection string format:
   ```env
   DATABASE_URL=postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/nudge?sslmode=require
   ```

#### 5. `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` — [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the required APIs under **APIs & Services > Library**:
   * **Gmail API**
   * **Google Calendar API**
3. Configure the **OAuth consent screen** (**APIs & Services > OAuth consent screen**):
   * User Type: **External**
   * App name: `Nudge`
   * Scopes to add:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
   * Add your Google account email under **Test users**.
4. Create Credentials (**APIs & Services > Credentials > Create Credentials > OAuth client ID**):
   * Application type: **Web application**
   * Name: `Nudge Web Client`
   * **Authorized redirect URIs**:
     ```
     http://localhost:3001/auth/google/callback
     ```
5. Copy the generated **Client ID** and **Client Secret**:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
   ```

#### 6. `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/app/apikey)
1. Navigate to [Google AI Studio API Keys](https://aistudio.google.com/app/apikey).
2. Click **Create API Key** (select your Google Cloud project or create a new one).
3. Copy the key:
   ```env
   GEMINI_API_KEY=AIzaSy...
   AI_CONFIDENCE_THRESHOLD=0.75
   ```

#### 7. `REDIS_URL` — [Upstash](https://upstash.com)
1. Sign in to Upstash and go to **Redis > Create Database**.
2. Select standard settings and enable TLS.
3. In the database details, scroll to **Node (ioredis)** tab or copy the **TLS connection string**:
   ```env
   REDIS_URL=rediss://default:your-token@your-endpoint.upstash.io:6379
   ```
   *(Must start with `rediss://`, indicating TLS).*

#### 8. `RESEND_API_KEY` & `RESEND_FROM_EMAIL` — [Resend](https://resend.com)
1. Sign in to **Resend**.
2. Go to **API Keys > Create API Key** (give it full access).
3. Copy the key (starts with `re_`):
   ```env
   RESEND_API_KEY=re_123456789...
   ```
4. For `RESEND_FROM_EMAIL`:
   * If you have verified a custom domain on Resend: `nudge@yourdomain.com`
   * If testing without a domain yet: `onboarding@resend.dev` (only sends to your registered Resend account email).

---

### Step 4: Summary of Final Values

#### [apps/api/.env](file:///c:/Users/Shekinah/Dev/moi/nudge/apps/api/.env)
```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/nudge?sslmode=require

JWT_SECRET=<generated-64-char-hex>
ENCRYPTION_KEY=<generated-64-char-hex>

GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

GEMINI_API_KEY=<from-google-ai-studio>
AI_CONFIDENCE_THRESHOLD=0.75

REDIS_URL=rediss://default:...@...upstash.io:6379

RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev

VAPID_PUBLIC_KEY=<generated-vapid-public-key>
VAPID_PRIVATE_KEY=<generated-vapid-private-key>
VAPID_SUBJECT=mailto:your-email@example.com
```

#### [apps/web/.env.local](file:///c:/Users/Shekinah/Dev/moi/nudge/apps/web/.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same-vapid-public-key-from-api>
```

Ran command: `node --version`
Ran command: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Ran command: `node -e "const wp = require('web-push'); console.log(wp.generateVAPIDKeys())"`


