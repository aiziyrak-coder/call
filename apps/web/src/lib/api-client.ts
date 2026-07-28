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
    if (access) memoryAccessToken = access;
  },
  clear(): void {
    memoryAccessToken = null;
  },
};

let refreshInFlight: Promise<boolean> | null = null;
const REFRESH_LOCK_CHANNEL =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('aicc-auth-refresh') : null;

/** Bir tab refresh qilayotganda boshqalari kutadi — refresh token oilasini buzmaslik. */
export async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    REFRESH_LOCK_CHANNEL?.postMessage({ type: 'refresh-start' });
    try {
      const response = await fetch(`${API_BASE}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        tokenStore.clear();
        REFRESH_LOCK_CHANNEL?.postMessage({ type: 'refresh-fail' });
        return false;
      }
      const data = (await response.json()) as { accessToken?: string; expiresIn?: number };
      if (data.accessToken) tokenStore.set(data.accessToken);
      REFRESH_LOCK_CHANNEL?.postMessage({ type: 'refresh-ok' });
      return true;
    } catch {
      REFRESH_LOCK_CHANNEL?.postMessage({ type: 'refresh-fail' });
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

if (REFRESH_LOCK_CHANNEL) {
  REFRESH_LOCK_CHANNEL.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string } | undefined;
    if (data?.type === 'refresh-start' && !refreshInFlight) {
      // Boshqa tab refresh qilmoqda — shu tab ham shu promise ni kutishi uchun
      // qisqa "kutish" flagni qo'yamiz (haqiqiy so'rov yubormaymiz).
      refreshInFlight = new Promise((resolve) => {
        const onDone = (next: MessageEvent) => {
          const payload = next.data as { type?: string } | undefined;
          if (payload?.type === 'refresh-ok') {
            REFRESH_LOCK_CHANNEL?.removeEventListener('message', onDone);
            refreshInFlight = null;
            resolve(true);
          } else if (payload?.type === 'refresh-fail') {
            REFRESH_LOCK_CHANNEL?.removeEventListener('message', onDone);
            refreshInFlight = null;
            resolve(false);
          }
        };
        REFRESH_LOCK_CHANNEL?.addEventListener('message', onDone);
        setTimeout(() => {
          REFRESH_LOCK_CHANNEL?.removeEventListener('message', onDone);
          refreshInFlight = null;
          resolve(false);
        }, 8_000);
      });
    }
  });
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Autentifikatsiyasiz so'rov (login, refresh). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): URL {
  const url = new URL(`${API_BASE}${API_PREFIX}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function authHeaders(anonymous?: boolean): HeadersInit {
  return {
    ...(anonymous || !tokenStore.access ? {} : { Authorization: `Bearer ${tokenStore.access}` }),
  };
}

async function withAuthRetry(send: () => Promise<Response>, anonymous?: boolean): Promise<Response> {
  let response = await send();
  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await send();
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);

  const response = await withAuthRetry(
    () =>
      fetch(url, {
        method: options.method ?? 'GET',
        credentials: 'include',
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...authHeaders(options.anonymous),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      }),
    options.anonymous,
  );

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

/** CSV / audio kabi binary javoblar — 401 da refresh qiladi. */
export async function fetchBlob(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<Blob> {
  const url = buildUrl(path, options.query);
  const response = await withAuthRetry(
    () =>
      fetch(url, {
        method: options.method ?? 'GET',
        credentials: 'include',
        headers: authHeaders(options.anonymous),
        signal: options.signal,
      }),
    options.anonymous,
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(
      payload?.message ?? `So'rov muvaffaqiyatsiz (${response.status})`,
      response.status,
    );
  }

  return response.blob();
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
