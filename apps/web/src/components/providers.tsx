'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import type { CurrentUser } from '@/lib/types';

/** Modul darajasida bitta boot — StrictMode/double-mount xavfsiz. */
let bootPromise: Promise<CurrentUser | null> | null = null;

function resolveSession(): Promise<CurrentUser | null> {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8_000);
    try {
      const origin = window.location.origin;
      let me = await fetch(`${origin}/api/v1/users/me`, {
        credentials: 'include',
        signal: ctrl.signal,
      });

      if (me.status === 401) {
        const refreshed = await fetch(`${origin}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: ctrl.signal,
        });
        if (refreshed.ok) {
          me = await fetch(`${origin}/api/v1/users/me`, {
            credentials: 'include',
            signal: ctrl.signal,
          });
        }
      }

      if (!me.ok) return null;
      return (await me.json()) as CurrentUser;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  return bootPromise;
}

function AuthBootstrap({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    void resolveSession()
      .then((profile) => {
        if (!profile) tokenStore.clear();
        setUser(profile);
      })
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      });
  }, [setUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthBootstrap>{children}</AuthBootstrap>
        <Toaster position="top-center" closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
