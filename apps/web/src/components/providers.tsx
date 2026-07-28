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
    // Eski localStorage tokenlari — XSS xavfini bartaraf etish.
    try {
      window.localStorage.removeItem('aicc.accessToken');
      window.localStorage.removeItem('aicc.refreshToken');
    } catch {
      /* ignore */
    }

    const boot = async () => {
      try {
        // Access cookie yoki xotiradagi token orqali.
        const profile = await api.get<CurrentUser>('/users/me');
        if (!cancelled) setUser(profile);
        return;
      } catch {
        // Access muddati o'tgan bo'lishi mumkin — refresh cookie uriniladi.
      }

      try {
        const refreshed = await api.post<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          {},
          { anonymous: true },
        );
        tokenStore.set(refreshed.accessToken, refreshed.refreshToken);
        const profile = await api.get<CurrentUser>('/users/me');
        if (!cancelled) setUser(profile);
      } catch {
        if (!cancelled) {
          tokenStore.clear();
          setUser(null);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
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
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
