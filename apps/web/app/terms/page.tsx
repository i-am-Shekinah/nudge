import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Nudge',
  description: 'The rules of the road for using Nudge: what it promises, what it does not, and who is liable for what.',
};

// REVIEWER NOTES (not user-facing):
// - Free product: no payment code anywhere, so no fee/refund/billing clauses.
// - Termination IS implemented (Settings -> DELETE /auth/account cascade +
//   Google revocation, auth.service.ts deleteAccount); deletion promises here
//   must stay in lockstep with the Privacy Policy.
// - No rate-limit/throttler or moderation tooling exists, so acceptable-use
//   rules are stated as contract terms, enforced by account deletion.
// - Flow-through of Google API terms is real: we use Gmail/Calendar/Gemini/FCM
//   under user grants (google.strategy.ts scopes).
// - Liability posture confirmed by operator: AS-IS, ₦10,000 aggregate cap,
//   Nigerian law, ordinary courts, no arbitration clause.
// ASSUMPTIONS TO CONFIRM: company's registered country (Nigeria assumed, matching
// governing law; RC No. 9904330 supplied by operator 2026-10-14), contact
// mailbox, age floor 13+. Operator confirmed 2026-10-14: Ocean Digital Labs
// Limited (sole-founder company), not the user personally.
// Draft — must be reviewed by a qualified attorney before going live.

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

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p style={{ ...p, marginBottom: '2.5rem' }}>
          Effective 14 October 2026. These terms are a deal between you and the company that
          operates Nudge. In exchange for letting us read your Gmail subject lines on your
          behalf, we nudge you about the events hiding in your inbox. Free, as-is, and gone
          the moment you delete your account.
        </p>

        <h2 style={h2}>1. Who we are</h2>
        <p style={p}>
          Nudge is operated by Ocean Digital Labs Limited (RC No. 9904330),
          trading as &ldquo;Nudge&rdquo;, and can be reached at{' '}
          <a
            href="mailto:support@nudge.app"
            style={{ color: 'var(--text-primary)', fontWeight: 600 }}
          >
            support@nudge.app
          </a>
          . By creating an account you accept these terms.
        </p>

        <h2 style={h2}>2. Eligibility</h2>
        <p style={p}>
          You must be at least 13 years old and old enough under your local law to grant a
          Google account the permissions Nudge requires. If you use a school or work Google
          account, make sure your organisation permits this kind of access.
        </p>

        <h2 style={h2}>3. What the service does</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li style={li}>
            Nudge scans your Gmail on a schedule you configure, uses AI to spot events,
            and reminds you about them by email or push notification.
          </li>
          <li style={li}>
            Only after you approve a suggestion does Nudge create a corresponding event in
            your Google Calendar. Nothing is written to your calendar without that approval.
          </li>
          <li style={li}>
            The service is provided free of charge. We may add paid features later; if we
            do, they will come with their own terms and never change the free core without
            notice.
          </li>
        </ul>

        <h2 style={h2}>4. Your responsibilities</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li style={li}>
            Keep your sign-in credentials and devices secure; you are responsible for
            activity under your account.
          </li>
          <li style={li}>
            Use Nudge only for your own mailbox. Sharing access tokens, reverse-engineering
            the service, overloading the scan pipeline, or using Nudge to access mail you
            are not entitled to is prohibited.
          </li>
          <li style={li}>
            You keep full ownership of your mail and calendar data; you grant us only the
            narrow, revocable access described in the Privacy Policy.
          </li>
        </ul>

        <h2 style={h2}>5. Google and other platforms</h2>
        <p style={p}>
          Nudge works through Google services (Gmail, Calendar, Gemini, Firebase) and other
          providers named in the Privacy Policy. Your use of those services is also governed
          by Google&rsquo;s own terms, and Google may change or revoke the APIs we rely on.
          If a platform outage breaks a feature, that is not a breach of these terms — but
          deleting your account always remains available to you, directly inside Google too.
        </p>

        <h2 style={h2}>6. Accuracy &amp; no guarantee</h2>
        <p style={p}>
          Event detection is done by AI reading subject lines and snippets. Nudge can miss
          events, misread dates, or invent details that were never in the email. Always
          verify critical dates against the original message — Nudge is a helper, not a
          source of truth, and missing a deadline because you relied on it is your own risk.
        </p>

        <h2 style={h2}>7. Suspension &amp; termination</h2>
        <p style={p}>
          You can terminate at any time via Settings &rarr; Delete account; we then delete
          your data and revoke our Google access as described in the Privacy Policy. We may
          suspend or terminate accounts that violate these terms — typically by blocking the
          account from the service. Either way, termination is clean: nothing of yours stays
          behind except calendar events you approved, which are yours to manage in Google
          Calendar.
        </p>

        <h2 style={h2}>8. Disclaimers</h2>
        <p style={p}>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, to the fullest extent permitted by law — including no
          warranty that notifications will be delivered on time (phone manufacturers, push
          services, and mail providers all sit between us and your lock screen).
        </p>

        <h2 style={h2}>9. Limitation of liability</h2>
        <p style={p}>
          To the maximum extent permitted by law, the operator&rsquo;s total liability arising
          out of your use of Nudge — whether in contract, tort, or otherwise — is limited to
          ₦10,000 (about US$10), and excludes indirect, incidental, or consequential losses
          such as missed deadlines, lost opportunities, or data in your own mailbox or
          calendar. Because Nudge is free and reads only what you authorize, this cap reflects
          the real value at stake. Nothing here excludes liability that cannot lawfully be
          excluded.
        </p>

        <h2 style={h2}>10. Changes to these terms</h2>
        <p style={p}>
          We may update these terms as the product grows. For material changes we will email
          you and post the new version here with a fresh effective date; if you keep using
          Nudge afterwards, the updated terms apply.
        </p>

        <h2 style={h2}>11. Governing law &amp; disputes</h2>
        <p style={p}>
          These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute
          will be resolved in the ordinary courts of Nigeria; there is no mandatory
          arbitration or class-action waiver. Before going to court, drop us a line at{' '}
          <a
            href="mailto:support@nudge.app"
            style={{ color: 'var(--text-primary)', fontWeight: 600 }}
          >
            support@nudge.app
          </a>{' '}
          — most problems end there.
        </p>
      </main>
    </div>
  );
}
