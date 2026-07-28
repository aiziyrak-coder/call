'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import type { CurrentUser } from '@/lib/types';

function goLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  window.location.replace('/login');
}

/** StrictMode ikki marta mount qilsa ham bitta boot. */
let bootPromise: Promise<CurrentUser | null> | null = null;

async function resolveSession(): Promise<CurrentUser | null> {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const origin = window.location.origin;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8_000);

    try {
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

/**
 * Sessiyani mustaqil fetch bilan tekshiradi (api-client retry loopsiz).
 * Sessiyasiz → darhol /login.
 */
function AuthBootstrap({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const profile = await resolveSession();
      if (!alive) return;
      if (!profile) tokenStore.clear();
      setUser(profile);
      if (!profile) goLogin();
    })();

    return () => {
      alive = false;
    };
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
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            className:
              '!rounded-2xl !border !border-[var(--color-border-subtle)] !bg-[var(--color-glass)] !backdrop-blur-xl !text-[var(--color-text-primary)] !shadow-[var(--shadow-glass)]',
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
