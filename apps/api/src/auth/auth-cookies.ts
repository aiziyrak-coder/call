import type { Response } from 'express';

export const ACCESS_COOKIE = 'aicc_access';
export const REFRESH_COOKIE = 'aicc_refresh';

const isProd = () => process.env.NODE_ENV === 'production';

/** Access JWT — qisqa muddatli httpOnly cookie. */
export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
): void {
  const secure = isProd();
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expiresIn * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const secure = isProd();
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
}

/** Brauzerga refresh tokenni JSON da bermaymiz — faqat cookie. */
export function publicTokenResponse(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  return {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
  };
}
