import { isNativePlatform } from './mobile';
import { API_URL } from './api';
import { getToken } from './auth-token';

// Registers the device for native push and stores its token server-side.
// No-op outside the Capacitor shell (the PWA keeps using web-push).
export async function registerNativePush(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  const accessToken = await getToken();
  if (!accessToken) return false;

  const [{ PushNotifications }, { Capacitor }] = await Promise.all([
    import('@capacitor/push-notifications'),
    import('@capacitor/core'),
  ]);

  // Apple requires registerForRemoteNotifications before any permission
  // prompt, so register() runs first and the prompt follows.
  await PushNotifications.register();
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    void PushNotifications.addListener('registration', async ({ value }) => {
      try {
        const res = await fetch(`${API_URL}/settings/native-subscription`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }),
        });
        finish(res.ok);
      } catch {
        finish(false);
      }
    }).then(() =>
      PushNotifications.addListener('registrationError', () => finish(false)),
    );

    setTimeout(() => finish(false), 10_000);
  });
}
