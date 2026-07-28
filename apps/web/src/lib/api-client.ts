const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
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

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

let refreshInFlight: Promise<boolean> | null = null;

function apiOrigin(): string {
  if (API_BASE) return API_BASE.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:4000';
}

/** Bir tab refresh qilayotganda boshqalari kutadi — refresh token oilasini buzmaslik. */
export async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${apiOrigin()}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        signal: abortAfter(8_000),
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
      refreshInFlight = null;
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

function buildUrl(path: string, query?: RequestOptions['query']): URL {
  const url = new URL(`${apiOrigin()}${API_PREFIX}${path}`);
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
        signal: options.signal ?? abortAfter(20_000),
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
        signal: options.signal ?? abortAfter(60_000),
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
