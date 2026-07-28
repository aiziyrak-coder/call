import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isAccessAlive(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === 'number' && data.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.svg' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const access = request.cookies.get('aicc_access')?.value;
  if (!isAccessAlive(access)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const response = NextResponse.redirect(url);
    // Muddati o'tgan cookie ni tozalash — keyingi urinishlarda chalkashmasin.
    response.cookies.set('aicc_access', '', { path: '/', maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
