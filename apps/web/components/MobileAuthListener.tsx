'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '../lib/mobile';
import { setTokens } from '../lib/auth-token';

// In the Capacitor shell, login completes when the system browser redirects
// to nudge://auth/callback?code=... The code is single-use and 60-second
// lived; we exchange it for the JWT over POST (nothing sensitive in a URL).
// The WebView's renderer can be killed while the custom tab owns the
// screen; on return, the reloaded page misses the appUrlOpen event that
// fired before its listener re-attached. getLaunchUrl() replays the same
// intent, so we process the deep link from both paths and dedupe by code.
export function MobileAuthListener() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    if (!isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;
    const processed = new Set<string>();

    const handleUrl = async (url: string) => {
      // NOTE: URL() on older WebKit/Chromium parses custom schemes as
      // host='' + pathname='//auth/callback', so match the raw string.
      if (url.startsWith('nudge://push')) {
        const target =
          new URLSearchParams(url.split('?')[1] ?? '').get('url') || '/dashboard';
        router.replace(target);
        return;
      }
      if (!url.startsWith('nudge://auth/callback')) {
        return;
      }
      const code = new URLSearchParams(url.split('?')[1] ?? '').get('code');
      if (!code) {
        router.replace('/?error=auth_failed');
        return;
      }
      if (processed.has(code)) return;
      processed.add(code);
      // The WebView's network stack can still be thawing when appUrlOpen
      // lands: the first fetch may reject in <5ms or hang with no response
      // at all. The code has a 60s life, so time out at 4s and retry with
      // backoff before giving up.
      const attempt = async (): Promise<Response> => {
        return fetch(`${apiUrl}/auth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: AbortSignal.timeout(4000),
        });
      };
      let res: Response;
      try {
        try {
          res = await attempt();
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            res = await attempt();
          } catch {
            await new Promise((r) => setTimeout(r, 2000));
            res = await attempt();
          }
        }
      } catch {
        router.replace('/?error=auth_failed');
        return;
      }
      if (!res.ok) {
        router.replace('/?error=auth_failed');
        return;
      }
      try {
        const { token, refreshToken, isNewUser } = await res.json();
        await setTokens(token, refreshToken);
        // Push registration needs a fresh session; fire and forget so a
        // denied permission can never block the login redirect.
        void (await import('../lib/native-push')).registerNativePush();
        router.replace(isNewUser ? '/onboarding' : '/dashboard');
      } catch {
        router.replace('/?error=auth_failed');
      }
    };

    void (async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;

      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        void handleUrl(url);
      });
      const resume = await App.addListener('resume', async () => {
        const launch = await App.getLaunchUrl();
        if (launch?.url) void handleUrl(launch.url);
      });
      remove = () => {
        void handle.remove();
        void resume.remove();
      };

      const launch = await App.getLaunchUrl();
      if (launch?.url) void handleUrl(launch.url);
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [apiUrl, router]);

  return null;
}
