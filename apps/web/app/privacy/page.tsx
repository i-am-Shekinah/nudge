import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Nudge',
  description:
    'What Nudge collects from your Google account, how it is processed and stored, and how you can remove it.',
};

// REVIEWER NOTES (not user-facing) — every statement below is anchored to code:
// - OAuth scopes: email, profile, gmail.readonly, calendar.events — google.strategy.ts:31-36
// - No raw email bodies stored: schema.prisma:78; body sent to Gemini is a
//   <=4000-char excerpt, gmail.service.ts:191 + ai.service.ts renderEmailBlock
// - Google tokens encrypted AES-256-GCM at rest: schema.prisma:22-23, crypto.util.ts
// - Auth codes + session refresh tokens stored only as SHA-256 hashes:
//   schema.prisma:113-151; 15m access JWT auth.module.ts:26; 60d sliding refresh
// - Events purged 7 days after event date, all statuses: autoDeleteAt
//   (schema.prisma:102) + auto-delete.orchestrator.ts sweep
// - Account deletion (Google revoke + cascade): auth.service.ts deleteAccount
// - Email via Resend (digest@/alerts@nudge.app), push via VAPID web-push + FCM
// - No analytics, no ad SDKs, no crash reporting anywhere in the codebase.
// ASSUMPTIONS TO CONFIRM BEFORE PUBLICATION: hosting location, 13+ age floor,
// contact mailbox. Operator confirmed 2026-10-14: Ocean Digital Labs Limited
// (data controller). Draft — must be reviewed by a qualified attorney before
// going live.

const h2: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 700,
  margin: '2.25rem 0 0.75rem',
  color: 'var(--text-primary)',
};

const p: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.75,
  color: 'var(--text-secondary)',
  margin: '0 0 0.9rem',
};

const li: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
  marginBottom: '0.4rem',
};

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          padding: 'calc(1rem + env(safe-area-inset-top)) 1.5rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Nudge</span>
        <a
          href="/settings/"
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          ← Settings
        </a>
      </header>

      <main
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '2.5rem 1.5rem 5rem',
        }}
      >
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          Privacy Policy
        </h1>
        <p style={{ ...p, marginBottom: '2.5rem' }}>
          Effective 14 October 2026. Nudge reads your Gmail to find events, nudges you about
          them, and puts the ones you approve on your Google Calendar. This policy says exactly
          what we collect, what we never touch, and how to make it all disappear.
        </p>

        <h2 style={h2}>1. What we collect</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>
              Google profile
            </strong>{' '}
            — your name, email address, Google account ID, and profile photo URL, collected
            when you sign in with Google.
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Google access tokens</strong>{' '}
            — an OAuth access token and refresh token for your Gmail and Calendar. These are
            stored encrypted (AES-256-GCM) and are used only to read your mail and write the
            calendar events you approve.
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Notification settings</strong> —
            your timezone, preferred daily digest time, reminder intervals, browser push
            subscriptions, and (for the mobile app) a Firebase Cloud Messaging device token.
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Detected events</strong> — for
            each event we find: the email&rsquo;s subject line, sender address, a link back to
            the message in Gmail, and AI-extracted details (title, date, deadline, category).
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Scan metadata</strong> — per-scan
            counts (emails scanned, events found, errors). No message content.
          </li>
        </ul>

        <h2 style={h2}>2. What we never store</h2>
        <p style={p}>
          Nudge does not store your raw email bodies. When an email needs deeper analysis to
          pin down a date, a short excerpt of the body (up to 4,000 characters) is sent to the
          AI provider and then discarded — it is never written to our database. We also do not
          collect or store your Google password, and we never access mail older than the
          current scan window.
        </p>

        <h2 style={h2}>3. How your mail is accessed</h2>
        <p style={p}>
          You grant Nudge two Google permissions: <em>view your mail</em> (read-only) and{' '}
          <em>create and manage calendar events you create</em>. Scans run on your schedule,
          read your messages via the Gmail API, and never send, delete, or modify mail.
          Calendar events are only created after you approve the corresponding suggestion;
          events you ignore are never written to your calendar.
        </p>

        <h2 style={h2}>4. Third-party services that process your data</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Google</strong> — OAuth sign-in,
            Gmail API, Calendar API, Gemini (AI extraction of event details from subject,
            sender, date, snippet, and any transient body excerpt), and Firebase Cloud
            Messaging (mobile push delivery).
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>Resend</strong> — transactional
            email delivery for digests and alerts sent from @nudge.app addresses.
          </li>
          <li style={li}>
            <strong style={{ color: 'var(--text-primary)' }}>
              Browser push services
            </strong>{' '}
            — standard Web Push (VAPID) relays notification payloads to your browser.
          </li>
        </ul>
        <p style={{ ...p, marginTop: '0.9rem' }}>
          We use no analytics tools, no advertising SDKs, and no crash-reporting services.
          Nothing about you is sold or shared for marketing.
        </p>

        <h2 style={h2}>5. How long we keep things</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li style={li}>
            Detected events are automatically deleted 7 days after the event date, whether you
            approved, ignored, or never acted on them.
          </li>
          <li style={li}>
            Login codes expire in 60 seconds; session refresh tokens expire after 60 days of
            inactivity.
          </li>
          <li style={li}>
            Calendar events you approved live in your Google Calendar under Google&rsquo;s
            retention — delete them there anytime; they were never copies of your mail.
          </li>
          <li style={li}>
            Everything else — your profile, tokens, settings, and history — is deleted when
            you delete your account (below).
          </li>
        </ul>

        <h2 style={h2}>6. Deleting your data</h2>
        <p style={p}>
          Settings &rarr; <strong>Danger Zone</strong> permanently deletes your account: your
          profile, stored Google tokens, events, sessions, and push tokens are removed in one
          cascade, and we ask Google to revoke Nudge&rsquo;s access to your account at the same
          time. You can also revoke access yourself at any time on your Google{' '}
          <em>Third-party sites &amp; apps</em> page. Deleted data cannot be recovered; data
          already delivered to the third parties in section 4 is governed by their own deletion
          policies.
        </p>

        <h2 style={h2}>7. Security</h2>
        <p style={p}>
          Google tokens are encrypted at rest; one-time login codes and session refresh tokens
          are stored only as salted SHA-256 hashes, and a reused refresh token revokes its
          whole chain. Access tokens are short-lived (15 minutes). All communication runs over
          HTTPS. No system is unbreakable, but nothing we store lets Nudge read your mail
          without Google&rsquo;s own authorization gates.
        </p>

        <h2 style={h2}>8. Children</h2>
        <p style={p}>
          Nudge is intended for users aged 13 and older (Google&rsquo;s minimum age for an
          account with Gmail access). We do not knowingly collect data from children under 13;
          if we learn we have, we delete the account.
        </p>

        <h2 style={h2}>9. Changes to this policy</h2>
        <p style={p}>
          If we make a material change, we will tell you by email (to your Nudge-address) and
          update the date at the top of this page. Continued use after a change means the new
          policy applies.
        </p>

        <h2 style={h2}>10. Contact</h2>
        <p style={p}>
          Privacy questions, deletion requests, or complaints:{' '}
          <a
            href="mailto:support@nudge.app"
            style={{ color: 'var(--text-primary)', fontWeight: 600 }}
          >
            support@nudge.app
          </a>
          . Nudge is operated by Ocean Digital Labs Limited (RC No. 9904330),
          trading as Nudge, with data hosted in [hosting provider / region — to confirm].
        </p>
      </main>
    </div>
  );
}
