'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { api, tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import type { CurrentUser } from '@/lib/types';

function AuthBootstrap({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    // Eski localStorage tokenlari — XSS xavfini bartaraf etish.
    try {
      window.localStorage.removeItem('aicc.accessToken');
      window.localStorage.removeItem('aicc.refreshToken');
    } catch {
      /* ignore */
    }

    const finish = (user: CurrentUser | null) => {
      settled = true;
      if (!cancelled) {
        if (!user) tokenStore.clear();
        setUser(user);
      }
    };

    const boot = async () => {
      try {
        const profile = await api.get<CurrentUser>('/users/me');
        finish(profile);
        return;
      } catch {
        // Access muddati o'tgan bo'lishi mumkin — refresh cookie uriniladi.
      }

      try {
        const refreshed = await api.post<{ accessToken?: string; expiresIn?: number }>(
          '/auth/refresh',
          {},
          { anonymous: true },
        );
        if (refreshed.accessToken) tokenStore.set(refreshed.accessToken);
        const profile = await api.get<CurrentUser>('/users/me');
        finish(profile);
      } catch {
        finish(null);
      }
    };

    // Nginx/tarmoq uzilsa spinnerda qolib ketmaslik.
    const watchdog = window.setTimeout(() => {
      if (!cancelled && !settled) finish(null);
    }, 12_000);

    void boot().finally(() => window.clearTimeout(watchdog));
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
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
