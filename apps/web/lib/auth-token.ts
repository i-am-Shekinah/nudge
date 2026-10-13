import { isNativePlatform } from './mobile';

const TOKEN_KEY = 'nudge_token';
const REFRESH_KEY = 'nudge_refresh';

// Single seam for session storage: on the web the tokens live in
// localStorage (+ cookie fallback); in the Capacitor shell they go to
// Preferences, which is backed by SharedPreferences/Keychain. The plugin
// is imported lazily so it never loads in the browser bundle.

async function read(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!isNativePlatform()) return localStorage.getItem(key);
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key });
  return value;
}

async function write(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

async function remove(key: string): Promise<void> {
  if (isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}

export async function getToken(): Promise<string | null> {
  return read(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return read(REFRESH_KEY);
}

export async function setToken(token: string): Promise<void> {
  await write(TOKEN_KEY, token);
  if (!isNativePlatform()) {
    document.cookie = `nudge_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  }
}

export async function setTokens(token: string, refreshToken: string): Promise<void> {
  await Promise.all([setToken(token), write(REFRESH_KEY, refreshToken)]);
}

export async function clearToken(): Promise<void> {
  await Promise.all([remove(TOKEN_KEY), remove(REFRESH_KEY)]);
  if (!isNativePlatform()) {
    document.cookie = 'nudge_token=; path=/; max-age=0';
  }
}
