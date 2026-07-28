'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Clock, PhoneCall, PhoneMissed } from 'lucide-react';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatDuration, formatPhone } from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import type { ActiveCall, CallListItem, Paged } from '@/lib/types';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const activeQuery = useQuery({
    queryKey: ['calls', 'active'],
    queryFn: () => api.get<ActiveCall[]>('/calls/active'),
    refetchInterval: 5_000,
  });

  const recentQuery = useQuery({
    queryKey: ['calls', 'recent'],
    queryFn: () => api.get<Paged<CallListItem>>('/calls', { query: { pageSize: 10 } }),
  });

  // Qo'ng'iroq hodisasi kelganda ro'yxatlarni darhol yangilaymiz.
  useEffect(
    () =>
      onAiccEvent((event) => {
        if (event.type.startsWith('call.')) {
          void queryClient.invalidateQueries({ queryKey: ['calls'] });
        }
      }),
    [queryClient],
  );

  const calls = recentQuery.data?.items ?? [];
  const answered = calls.filter((call) => call.disposition === 'ANSWERED');
  const missed = calls.filter(
    (call) => call.disposition === 'NO_ANSWER' || call.disposition === 'ABANDONED',
  );
  const averageTalk =
    answered.length > 0
      ? Math.round(answered.reduce((sum, call) => sum + call.talkTimeSec, 0) / answered.length)
      : 0;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">
          Salom, {user?.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Bugungi ish holati va oxirgi suhbatlar
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon={PhoneCall}
          label="Faol suhbatlar"
          value={String(activeQuery.data?.length ?? 0)}
        />
        <StatCard
          icon={ArrowDownLeft}
          label="Javob berilgan"
          value={String(answered.length)}
          hint="oxirgi 10 ta ichida"
        />
        <StatCard
          icon={PhoneMissed}
          label="O'tkazib yuborilgan"
          value={String(missed.length)}
          tone="negative"
        />
        <StatCard icon={Clock} label="O'rtacha suhbat" value={formatDuration(averageTalk)} />
      </div>

      <Card>
        <CardHeader title="Hozir davom etayotgan suhbatlar" />
        {activeQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (activeQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="Faol suhbat yo'q"
            hint="Yangi qo'ng'iroq kelganda bu yerda ko'rinadi"
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {activeQuery.data?.map((call) => (
              <li key={call.callId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {call.direction === 'INBOUND' ? (
                    <ArrowDownLeft className="size-4 text-[var(--color-positive)]" />
                  ) : (
                    <ArrowUpRight className="size-4 text-[var(--color-brand)]" />
                  )}
                  <div>
                    <p className="font-mono text-sm">
                      {formatPhone(call.direction === 'INBOUND' ? call.from : call.to)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">{call.state}</p>
                  </div>
                </div>
                <span className="font-mono text-sm text-[var(--color-text-muted)]">
                  {formatDuration(call.durationSec)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Oxirgi qo'ng'iroqlar"
          action={
            <Link href="/calls" className="text-xs text-[var(--color-brand)] hover:underline">
              Barchasi
            </Link>
          }
        />
        {recentQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : calls.length === 0 ? (
          <EmptyState title="Qo'ng'iroqlar tarixi bo'sh" />
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {calls.map((call) => (
              <li key={call.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {call.direction === 'INBOUND' ? (
                    <ArrowDownLeft className="size-4 shrink-0 text-[var(--color-positive)]" />
                  ) : (
                    <ArrowUpRight className="size-4 shrink-0 text-[var(--color-brand)]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {contactName(call.contact) ??
                        formatPhone(call.direction === 'INBOUND' ? call.fromNumber : call.toNumber)}
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--color-text-muted)]">
                      {new Date(call.startedAt).toLocaleString('uz-UZ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={call.disposition === 'ANSWERED' ? 'positive' : 'negative'}>
                    {call.disposition ?? call.state}
                  </Badge>
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {formatDuration(call.talkTimeSec)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
  hint?: string;
  tone?: 'brand' | 'negative';
}) {
  const accent = tone === 'negative' ? 'var(--color-negative)' : 'var(--color-brand)';
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-9 items-center justify-center rounded-[0.85rem]"
          style={{ background: `color-mix(in oklch, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon className="size-[18px]" strokeWidth={2.25} />
        </div>
        <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{hint}</p> : null}
    </Card>
  );
}
