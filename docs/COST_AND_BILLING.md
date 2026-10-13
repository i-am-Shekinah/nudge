# Nudge — AI Cost, Quota & Billing Model

> Status: recommendation draft (2026-10-13). Born from the free-tier quota wall hit during
> manual backfill testing: Gemini free tier = **20 requests/day per project**, and a single
> 25-email backfill exhausted it.

## 1. How the quota actually counts

- Gemini limits are **per Google Cloud project (per API key), not per user**. Every Nudge user
  shares one pool. Free tier therefore caps out at roughly 10 users' worth of *first-day backfills*.
- Gmail API has its own per-project quota (~10,000 requests/day default). At 10 users we use
  ~500–1,000/day — not a constraint until hundreds of users.
- Paid tier removes the daily call cap: you pay **per token**, with generous rate limits.

## 2. Why our architecture is already cost-shaped

| Lever | Effect |
|---|---|
| Heuristic pre-filter (free, no LLM) | Kills newsletters/marketing/receipts before any Gemini call |
| Batch classification (`AI_BATCH_SIZE=20`) | ~20× fewer calls than per-email; a 200-email backfill = 10 calls |
| Cursor-based nightly scans | Never re-scans mail it has already classified — no duplicate spend |
| Body excerpts capped at 4,000 chars | Bounds input tokens per email |

Steady state per user per day: ~1–2 Gemini calls, ~20–40k input + 2–4k output tokens →
**fractions of a cent per user per day** at Flash-tier pricing. Verify current rates at
aistudio.google.com before trusting any absolute number here; the order of magnitude is robust.

## 3. Launch checklist (before any real user signs up)

1. Enable billing on the Cloud project; move the Gemini key to the paid tier.
2. Set a **budget alert and hard cap** (e.g. $10/month) in Google Cloud billing.
3. Keep the `RESOURCE_EXHAUSTED` fail-safe in code (it should never fire; if it does, it now
   fails the scan honestly and resumes next day instead of losing mail).
4. At >~50 users: stagger/queue the local-midnight scan cluster (thundering herd), and file a
   Gmail API quota increase when approaching ~5k requests/day.

## 4. Proposed payment model (draft for founder review)

Free tier is a product decision now that cost is negligible — the constraint is value, not spend.

### Free plan (launch default)
- Nightly scan (local midnight), morning digest email
- Backfill capped at 7 days
- No manual "Scan Now" (or 1/day)

### Pro plan (heavy users)
Target: power users with 100+/day inbox volume, recruiters, students mid-application.
- **On-demand "Scan Now"** (rate-limited, e.g. 5/day) — the feature heavy users actually want
- Deeper backfill (30–90 days)
- Higher per-scan email budget (no truncation for huge catch-ups)
- Priority reminder stages (more aggressive nudge cadence)
- Later: multiple Gmail accounts per profile

Pricing intuition: at ~$0.01–0.05/user/month of Gemini cost, even ₦2,000–5,000/month leaves
>95% gross margin on AI spend; Resend + push are similarly negligible. The bill is never the
problem — perceived value is. Do NOT gate the nightly scan behind payment; that's the product's
core promise.

### Anti-patterns to avoid
- Metering per detected event (punishes busy inboxes — our best customers)
- Unlimited on-demand scanning with no cap (invites quota abuse via scripted signups)
- Free tier that differs from paid in *speed* only — heavy users pay for depth and control, not latency
