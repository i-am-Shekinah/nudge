# Nudge → Mobile: implementation plan

Decided approach (2026-10-13): **Capacitor shell** over the existing Next.js UI · **both platforms** · **web push now, native push later** · **reuse the server-driven Google OAuth flow** · **own refresh-token sessions + short-lived code exchange** for the mobile auth handoff.

Why Capacitor: the app's real work (Gmail scanning, AI classification, calendar writes, reminders) all lives in the NestJS API; the web UI is already client-rendered and mobile-responsive at phone widths. One bundle can serve the hosted PWA and both native WebViews.

## Current state (PWA audit, 2026-10-13)

PWA support is effectively **missing**:

- `apps/web/public/sw.js` is push-only (`push` + `notificationclick`); no install, cache, or offline logic.
- No manifest (`app/manifest.ts` / `manifest.webmanifest`) → the app is **not installable**.
- `sw.js` references `/icon-192.png` and `/badge-72.png`, which **do not exist** → push notifications render a broken icon.
- The service worker only registers when a user enables push in Settings (`apps/web/lib/push.ts:15`).
- No `apple-touch-icon`, `themeColor`, or `appleWebApp` metadata → no iOS standalone mode.
- Auth JWT (7-day, `JWT_EXPIRES_IN` in the API) is stored in `localStorage` + a JS cookie (`apps/web/app/auth/callback/page.tsx:16-19`).

What is in place: all pages are `'use client'` and fetch the API with a Bearer token, no SSR cookie reads → the app is statically exportable, which both PWA and Capacitor need. Push infrastructure (VAPID + `web-push`, `/settings/push-subscription`) exists server-side.

## Phase 1 — Real PWA support (~1 day, web-only, ships independently)

1. `output: 'export'` in `apps/web/next.config.ts`; verify all 7 routes build statically.
2. `apps/web/app/manifest.ts` via the Next Metadata API: name, icons, `display: standalone`, theme color, `start_url: '/dashboard'`.
3. Generate `icon-192.png`, `icon-512.png`, a maskable variant, and `badge-72.png` (the files `sw.js` already points at).
4. iOS standalone metadata in `layout.tsx`: `themeColor`, `appleWebApp`, `apple-touch-icon`.
5. Register `/sw.js` once from the root layout, not only from the Settings push toggle — iOS requires an installed SW before push permission prompts work.
6. Offline app-shell precache in `sw.js`; API responses stay network-only (stale event data is worse than an empty state).
7. Token-storage seam: replace the scattered `localStorage.getItem('nudge_token')` reads with one `getToken()/setToken()` module (`apps/web/lib/auth-token.ts`). The PWA keeps localStorage; the mobile build swaps the implementation, not the call sites.

**Done when:** the app is installable (Lighthouse PWA passes), push notifications render with the real icon, and `pnpm build:web` outputs a static bundle.

## Phase 2 — Capacitor shell + secure auth handoff (~3 days)

1. New `apps/mobile` workspace package: Capacitor 7, `webDir` → the Phase-1 static export. Same bundle for PWA and both native WebViews.
2. Auth = **code exchange**, not JWT-in-a-URL:
   - Web hop: move the callback token from `?token=` to `#token=` (URL fragment: never reaches server logs or referrer headers). Existing web users keep working; no migration.
   - Mobile hop: `GET /auth/google?client=mobile` → after consent, the API mints a **single-use, 60-second code** → redirects `nudge://auth/callback?code=…` → the app POSTs `/auth/exchange {code}` → receives access JWT + refresh token. API work: `AuthCode` Prisma table (hashed code, TTL, consumed flag) + one endpoint.
   - `client` is an **exact-match enum** (`web` | `mobile`) mapping to fixed redirect targets server-side. Never a free-form redirect URL — a dynamic `?redirect=` would let an attacker craft `/auth/google?redirect=https://evil.com` and receive the session token in the query string.
3. Shell side: `@capacitor/browser` opens the system browser for the Google consent page (real consent UI, no WebView red flags, Google-compliant); `@capacitor/app` deep-link handler catches `nudge://auth/callback`; the refresh token goes to keychain/Keystore-backed storage behind the Phase-1 token module.
4. Env plumbing: API base URL per build. A phone can't reach `http://localhost:3001`, so dev testing needs a tunnel (ngrok / Tailscale Funnel) or a LAN IP — relevant given this machine's Google-edge quirks.
5. Native chrome: splash screen, app icons, safe-area padding (viewport already uses `viewportFit: cover`), `nudge://` + universal link registration on both platforms.

**Done when:** a full sign-in round-trip on a physical phone lands on the dashboard with live data, and the session survives an app kill.

## Phase 3 — Session durability + native push + store ship (~4–5 days)

> **Status (2026-10-13):** step 1 (refresh tokens) is done — see the
> `SessionRefreshToken` model, `POST /auth/refresh`, 15-minute access JWTs,
> and the `authFetch` refresh-on-401 helper in `apps/web/lib/api.ts`.
> Steps 2–3 (native push, store ship) remain; native push needs a Firebase
> project (FCM) and an Apple Developer account (APNs key).


1. **Refresh tokens** (committed, not "decide later"):
   - Opaque, **rotating** refresh token (60-day idle expiry), stored hashed on the user row; `POST /auth/refresh` returns a new pair and invalidates the old one; reuse of an already-consumed token revokes the whole chain (stolen-token detection).
   - Rationale: a push-driven app's session should expire on *inactivity*, not on a 7-day clock. Today a user taps a nudge a week after signing in and hits a login screen mid-intent — the one moment the product exists for.
   - Access JWT drops to **15 minutes** once refresh exists; continue accepting current 7-day JWTs so the deploy does not evict existing web users (reversible, zero-drama rollout).
   - Add silent refresh-on-401 to the web client too — the PWA gets the same fix.
   - Explicitly **rejected**: silent re-auth by bouncing through Google. The strategy sets `prompt: 'consent'` (`apps/api/src/modules/auth/strategies/google.strategy.ts:38`), so Google shows the full consent screen every time; dropping it would re-prompt Gmail scopes.
2. **Native push:** `@capacitor/push-notifications` → new `POST /settings/native-subscription`; API `PushSenderService` dispatches APNs/FCM vs web-push per user, keeping the same `{title, body, url}` payload so the existing notificationclick deep-links survive. iOS requires `registerForRemoteNotifications` on first run before any soft prompt — reorder the Settings push UX for iOS.
3. **Store ship:** privacy manifest + data-safety declarations (the Gmail read scope gets scrutiny), screenshots, TestFlight + internal Play track. Native push + native auth flow + offline shell are what clear App Store guideline 4.2 ("thin wrapper").

**Done when:** a phone idle for 10 days opens without a login screen, and tapping a push lands on the referenced event.

## Assumptions

- The API remains the single source of truth; scanner / AI / calendar are untouched.
- The web app keeps its current hosted deployment; PWA and shell share the identical bundle.
- Only two API additions: the code-exchange endpoint and the refresh-token flow. No rewrite.

## Risks

1. **Apple review time** — the only schedule item outside our control. Mitigated by the Phase-3 native features.
2. **`AuthCode` / refresh-token tables** need Prisma migrations: local PG (`nudge`) is the source of truth via `pnpm prisma:migrate`; Neon deploys with no baseline (wiped empty 2026-10-12).
3. **Deep links:** Android 12+ requires verified custom-scheme approval and iOS needs a universal link fallback — test both in Phase 2 step 5, not at store submission time.
