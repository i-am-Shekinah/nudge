import { describe, it, expect, vi } from 'vitest';
import { GoogleStrategy } from '../src/modules/auth/strategies/google.strategy.js';

describe('GoogleStrategy', () => {
  it('uses Google current OAuth endpoints, not the deprecated www.googleapis.com defaults', () => {
    const config = { get: vi.fn().mockReturnValue('real-client-id') } as any;
    const strategy = new GoogleStrategy(config) as any;

    // passport-google-oauth20 defaults these to www.googleapis.com, whose
    // edge routing failed on 2026-10-11 and took sign-in down with it.
    expect(strategy._oauth2._accessTokenUrl).toBe(
      'https://oauth2.googleapis.com/token',
    );
    expect(strategy._userProfileURL).toBe(
      'https://openidconnect.googleapis.com/v1/userinfo',
    );
    expect(strategy._oauth2._clientId).toBe('real-client-id');
  });
});
