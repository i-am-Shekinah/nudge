const BLOCKED_DOMAINS = [
  'mailchimp.com',
  'sendgrid.net',
  'constantcontact.com',
  'substack.com',
  'medium.com',
  'dripemail.com',
  'hubspotemail.net',
  'klaviyo.com',
  'campaign-archive.com',
];

const BLOCKED_SENDERS = [
  'newsletter@',
  'newsletters@',
  'marketing@',
  'promotions@',
  'offers@',
  'deals@',
  'notifications@github.com',
  'updates@linkedin.com',
];

const BLOCKED_SUBJECT_PATTERNS = [
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bweekly digest\b/i,
  /\bdaily digest\b/i,
  /\bweekly roundup\b/i,
  /\bpromotions?\b/i,
  /\b\d{1,2}%\s+off\b/i,
  /\bclearance sale\b/i,
  /\bblack friday\b/i,
  /\bcyber monday\b/i,
  /\blimited time (deal|offer)\b/i,
];

export interface FilterResult {
  shouldScan: boolean;
  reason?: string;
}

/**
 * Heuristic filter executed before sending email snippet to AI.
 * Drops commercial newsletters, marketing campaigns, and promotional blasts.
 */
export function filterEmailHeuristically(email: {
  subject: string;
  from: string;
}): FilterResult {
  const fromLower = (email.from || '').toLowerCase();
  const subjectLower = (email.subject || '').toLowerCase();

  // 1. Check sender domains
  for (const domain of BLOCKED_DOMAINS) {
    if (fromLower.includes(`@${domain}`) || fromLower.includes(`.${domain}`)) {
      return { shouldScan: false, reason: `Blocked marketing domain: ${domain}` };
    }
  }

  // 2. Check blocked sender prefixes
  for (const sender of BLOCKED_SENDERS) {
    if (fromLower.includes(sender)) {
      return { shouldScan: false, reason: `Blocked sender prefix: ${sender}` };
    }
  }

  // 3. Check subject patterns
  for (const pattern of BLOCKED_SUBJECT_PATTERNS) {
    if (pattern.test(subjectLower)) {
      return { shouldScan: false, reason: `Blocked subject pattern: ${pattern.source}` };
    }
  }

  return { shouldScan: true };
}
