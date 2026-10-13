'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '../lib/mobile';

// In the Capacitor shell, login completes when the system browser redirects
// to nudge://auth/callback?code=... The code is single-use and 60-second
// lived; we exchange it for the JWT over POST (nothing sensitive in a URL).
export function MobileAuthListener() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (!isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const [{ App }, { setTokens }] = await Promise.all([
        import('@capacitor/app'),
        import('../lib/auth-token'),
      ]);
      if (cancelled) return;

      const handle = await App.addListener('appUrlOpen', async ({ url }) => {
        const parsed = new URL(url);
        if (parsed.host !== 'auth' || !parsed.pathname.startsWith('/callback')) {
          return;
        }
        const code = parsed.searchParams.get('code');
        if (!code) {
          router.replace('/?error=auth_failed');
          return;
        }
        try {
          const res = await fetch(`${apiUrl}/auth/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            router.replace('/?error=auth_failed');
            return;
          }
          const { token, refreshToken, isNewUser } = await res.json();
          await setTokens(token, refreshToken);
          router.replace(isNewUser ? '/onboarding' : '/dashboard');
        } catch {
          router.replace('/?error=auth_failed');
        }
      });
      remove = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [apiUrl, router]);

  return null;
}
