import { describe, it, expect } from 'vitest';
import {
  getNextMidnight,
  getNextScheduledTime,
} from '../src/common/timezone.util.js';

describe('timezone.util', () => {
  it('should return a future timestamp for next midnight in various timezones', () => {
    const now = new Date('2026-10-15T14:30:00Z');

    const midnightUtc = getNextMidnight('UTC', now);
    expect(midnightUtc.getTime()).toBeGreaterThan(now.getTime());
    expect(midnightUtc.toISOString()).toBe('2026-10-16T00:00:00.000Z');

    const midnightTokyo = getNextMidnight('Asia/Tokyo', now); // UTC+9
    expect(midnightTokyo.getTime()).toBeGreaterThan(now.getTime());

    const midnightNY = getNextMidnight('America/New_York', now); // UTC-4
    expect(midnightNY.getTime()).toBeGreaterThan(now.getTime());
  });

  it('should compute next scheduled notification time in user timezone', () => {
    const morning = new Date('2026-10-15T06:00:00Z');

    // 07:00 UTC requested at 06:00 UTC -> should fire today at 07:00 UTC
    const next7am = getNextScheduledTime('07:00', 'UTC', morning);
    expect(next7am.toISOString()).toBe('2026-10-15T07:00:00.000Z');

    // 07:00 UTC requested at 08:00 UTC -> should fire tomorrow at 07:00 UTC
    const lateMorning = new Date('2026-10-15T08:00:00Z');
    const tomorrow7am = getNextScheduledTime('07:00', 'UTC', lateMorning);
    expect(tomorrow7am.toISOString()).toBe('2026-10-16T07:00:00.000Z');
  });
});
