import type { Role } from '@aicc/shared';

/** JWT access tokenidagi ma'lumot. */
export interface JwtPayload {
  sub: string;
  tid: string;
  email: string;
  roles: Role[];
  /** Ikki bosqichli tekshiruv hali o'tilmagan bo'lsa `false`. */
  mfa: boolean;
  iat?: number;
  exp?: number;
}

export interface RefreshPayload {
  sub: string;
  tid: string;
  /** Token oilasi — qayta ishlatish aniqlansa butun oila bekor qilinadi. */
  fid: string;
  /**
   * Noyob token identifikatori. Rotatsiya bir sekund ichida sodir bo'lganda
   * `iat` bir xil bo'ladi va `jti` bo'lmasa imzolangan token ham aynan
   * takrorlanib, xeshlar to'qnashadi.
   */
  jti: string;
  iat?: number;
  exp?: number;
}

/** Guard'lardan keyin `request.user` da turadigan obyekt. */
export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roles: Role[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
