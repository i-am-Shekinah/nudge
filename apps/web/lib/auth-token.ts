import { isNativePlatform } from './mobile';

const TOKEN_KEY = 'nudge_token';

// Single seam for session storage: on the web the JWT lives in
// localStorage (+ cookie fallback); in the Capacitor shell it goes to
// Preferences, which is backed by SharedPreferences/Keychain. The plugin
// is imported lazily so it never loads in the browser bundle.

export async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!isNativePlatform()) return localStorage.getItem(TOKEN_KEY);

  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value;
}

export async function setToken(token: string): Promise<void> {
  if (isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: TOKEN_KEY, value: token });
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `nudge_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export async function clearToken(): Promise<void> {
  if (isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: TOKEN_KEY });
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = 'nudge_token=; path=/; max-age=0';
}
