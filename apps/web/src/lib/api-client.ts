const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_PREFIX = '/api/v1';

/**
 * Dev da access token xotirada (Bearer).
 * Prod da faqat httpOnly cookie + credentials: 'include' (XSS Bearer o'g'irlash yo'q).
 */
let memoryAccessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get access(): string | null {
    return memoryAccessToken;
  },
  get refresh(): string | null {
    return null;
  },
  set(access: string, _refresh?: string): void {
    // Prod brauzerda JSON access kelmaydi — cookie yetarli.
    if (access) memoryAccessToken = access;
  },
  clear(): void {
    memoryAccessToken = null;
  },
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        tokenStore.clear();
        return false;
      }
      const data = (await response.json()) as { accessToken?: string; expiresIn?: number };
      if (data.accessToken) tokenStore.set(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Autentifikatsiyasiz so'rov (login, refresh). */
  anonymous?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE}${API_PREFIX}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const send = async (): Promise<Response> =>
    fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.anonymous || !tokenStore.access
          ? {}
          : { Authorization: `Bearer ${tokenStore.access}` }),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let response = await send();

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await send();
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      details?: unknown;
    } | null;
    throw new ApiError(
      payload?.message ?? `So'rov muvaffaqiyatsiz (${response.status})`,
      response.status,
      payload?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
