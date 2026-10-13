const TOKEN_KEY = 'nudge_token';

// Single seam for session storage: the Capacitor shell swaps this
// implementation for keychain/Keystore-backed storage without touching
// call sites. Behavior here matches what the app did inline before.

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `nudge_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = 'nudge_token=; path=/; max-age=0';
}
