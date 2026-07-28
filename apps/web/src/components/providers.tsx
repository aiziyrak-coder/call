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
    if (!tokenStore.access) {
      setUser(null);
      return;
    }
    api
      .get<CurrentUser>('/users/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, [setUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Real-time yangilanishlar socket orqali keladi, shuning uchun
            // agressiv qayta so'rovlar shart emas.
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
