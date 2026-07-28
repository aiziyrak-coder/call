import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from './app-shell';

/** Access JWT muddati tugagan/yo'q bo'lsa — client spinner kutmasdan login. */
function isAccessAlive(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === 'number' && data.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const access = jar.get('aicc_access')?.value;
  if (!isAccessAlive(access)) {
    redirect('/login');
  }

  return <AppShell>{children}</AppShell>;
}
