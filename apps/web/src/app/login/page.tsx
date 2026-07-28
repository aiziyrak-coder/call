'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones } from 'lucide-react';
import { api, tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { Button, Card, Input, Spinner } from '@/components/ui';
import type { CurrentUser, LoginResponse } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const finish = async (tokens?: { accessToken?: string; expiresIn?: number }) => {
    if (tokens?.accessToken) tokenStore.set(tokens.accessToken);
    const profile = await api.get<CurrentUser>('/users/me');
    setUser(profile);
    router.replace('/');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      if (mfaToken) {
        const result = await api.post<LoginResponse>(
          '/auth/mfa/verify',
          { mfaToken, code },
          { anonymous: true },
        );
        if (result.tokens) await finish(result.tokens);
        else if (result.status === 'authenticated') await finish();
        return;
      }

      const result = await api.post<LoginResponse>(
        '/auth/login',
        { email, password },
        { anonymous: true },
      );

      if (result.status === 'mfa_required' && result.mfaToken) {
        setMfaToken(result.mfaToken);
        return;
      }
      if (result.tokens) await finish(result.tokens);
      else if (result.status === 'authenticated') await finish();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kirishda xato yuz berdi');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-brand)]/12">
            <Headphones className="size-6 text-[var(--color-brand)]" />
          </div>
          <h1 className="text-xl font-semibold">AiCC</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {mfaToken ? 'Tasdiqlash kodini kiriting' : 'Tizimga kirish'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mfaToken ? (
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="text-center font-mono text-lg tracking-[0.4em]"
              autoFocus
              required
            />
          ) : (
            <>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@aicc.uz"
                autoComplete="username"
                autoFocus
                required
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Parol"
                autoComplete="current-password"
                required
              />
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-negative)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Spinner /> : mfaToken ? 'Tasdiqlash' : 'Kirish'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
