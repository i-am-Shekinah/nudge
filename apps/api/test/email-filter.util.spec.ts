import { describe, it, expect } from 'vitest';
import { filterEmailHeuristically } from '../src/modules/gmail/email-filter.util.js';

describe('email-filter.util', () => {
  it('should allow legitimate event emails to pass through', () => {
    const flightEmail = {
      from: 'reservations@united.com',
      subject: 'Your flight confirmation - UA 428 to San Francisco',
    };
    const webinarEmail = {
      from: 'sarah@techlead.io',
      subject: 'Invitation: Q4 Architecture Review @ Thu Oct 15',
    };

    expect(filterEmailHeuristically(flightEmail).shouldScan).toBe(true);
    expect(filterEmailHeuristically(webinarEmail).shouldScan).toBe(true);
  });

  it('should filter out emails from marketing platform domains', () => {
    const marketingEmail = {
      from: 'campaign@mailchimp.com',
      subject: 'Exciting news from our team',
    };
    const res = filterEmailHeuristically(marketingEmail);
    expect(res.shouldScan).toBe(false);
    expect(res.reason).toContain('Blocked marketing domain');
  });

  it('should filter out emails with newsletter or discount subject lines', () => {
    const newsletter = {
      from: 'john@startup.com',
      subject: 'Weekly Digest #42: Best practices in Node.js',
    };
    const discount = {
      from: 'deals@store.com',
      subject: 'Get 50% OFF everything this weekend!',
    };

    expect(filterEmailHeuristically(newsletter).shouldScan).toBe(false);
    expect(filterEmailHeuristically(discount).shouldScan).toBe(false);
  });
});
