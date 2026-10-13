import {
  getToken,
  getRefreshToken,
  setTokens,
  clearToken,
} from './auth-token';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let inFlightRefresh: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh chain dead (expired server-side or reuse detected): the
      // user must sign in again.
      await clearToken();
      return null;
    }
    const { token, refreshToken: next } = await res.json();
    await setTokens(token, next);
    return token;
  } catch {
    // Network blip: keep the session, the next call will retry.
    return null;
  }
}

// Refresh tokens rotate on use, so concurrent 401s must share ONE refresh.
function refreshOnce(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = tryRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let res = await fetch(`${API_URL}${path}`, withAuth(await getToken()));
  if (res.status === 401) {
    const fresh = await refreshOnce();
    if (fresh) res = await fetch(`${API_URL}${path}`, withAuth(fresh));
  }
  return res;
}
