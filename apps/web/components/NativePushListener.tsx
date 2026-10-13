'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '../lib/mobile';

// Native-shell half of push: routes taps to the event page and registers
// the device whenever a session already exists at app start.
export function NativePushListener() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;

    void (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      if (cancelled) return;

      await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const url = notification.data?.url as string | undefined;
        if (!url) {
          router.replace('/dashboard');
          return;
        }
        try {
          router.replace(new URL(url).pathname);
        } catch {
          router.replace('/dashboard');
        }
      });

      const { getToken } = await import('../lib/auth-token');
      const { registerNativePush } = await import('../lib/native-push');
      if ((await getToken()) && !cancelled) {
        void registerNativePush();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
