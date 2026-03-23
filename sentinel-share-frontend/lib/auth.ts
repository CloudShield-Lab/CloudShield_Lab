// MVP note: token stored in localStorage for simplicity.
// Production upgrade path: move to httpOnly cookie via a Next.js route handler.

const TOKEN_KEY = 'ss_token';
const USER_KEY = 'ss_user';

export function saveSession(token: string, user: object): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser<T = unknown>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function isTokenExpired(token: string): boolean {
  try {
    const base64url = token.split('.')[1];
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearSession();
    return false;
  }
  return true;
}
