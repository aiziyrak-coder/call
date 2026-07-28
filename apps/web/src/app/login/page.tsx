'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, LockKeyhole } from 'lucide-react';
import { api, tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { Button, Input, Spinner } from '@/components/ui';
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Liquid orbs */}
      <div
        className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full opacity-60 blur-3xl"
        style={{ background: 'color-mix(in oklch, var(--color-brand) 35%, transparent)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-1/4 size-80 rounded-full opacity-40 blur-3xl"
        style={{ background: 'color-mix(in oklch, var(--color-brand) 25%, oklch(80% 0.05 230))' }}
        aria-hidden
      />

      <div className="glass-strong animate-fade-up relative w-full max-w-[22rem] overflow-hidden rounded-[1.75rem] p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-[1.35rem] bg-[var(--color-brand)] text-white shadow-[0_12px_32px_color-mix(in_oklch,var(--color-brand)_40%,transparent)]">
            {mfaToken ? (
              <LockKeyhole className="size-7" strokeWidth={2} />
            ) : (
              <Headphones className="size-7" strokeWidth={2} />
            )}
          </div>
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em]">AiCC</h1>
            <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
              {mfaToken ? 'Tasdiqlash kodini kiriting' : 'Call-markazga xush kelibsiz'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {mfaToken ? (
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-14 text-center font-semibold text-2xl tracking-[0.45em]"
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
            <p
              role="alert"
              className="rounded-xl bg-[var(--color-negative)]/10 px-3 py-2 text-[13px] font-medium text-[var(--color-negative)]"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-1 h-12 w-full rounded-2xl text-[15px]" disabled={pending}>
            {pending ? <Spinner /> : mfaToken ? 'Tasdiqlash' : 'Davom etish'}
          </Button>
        </form>
      </div>
    </main>
  );
}
