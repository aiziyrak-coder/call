'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  MessageSquare,
  PhoneCall,
  PhoneMissed,
  Users,
} from 'lucide-react';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatDuration, formatPhone } from '@/lib/utils';
import type {
  CallListItem,
  HourlyLoad,
  KpiSummary,
  OperatorStats,
  Paged,
  RealtimeSnapshot,
} from '@/lib/types';
import { Badge, Card, CardHeader, EmptyState, Select, Spinner } from '@/components/ui';

const RANGES = [
  { value: '1', label: 'Bugun' },
  { value: '7', label: '7 kun' },
  { value: '30', label: '30 kun' },
] as const;

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [days, setDays] = useState('1');

  const canAll = user ? hasPermission(user.roles, 'analytics:read:all') : false;
  const canOwn = user ? hasPermission(user.roles, 'analytics:read:own') : false;
  const canAnalytics = canAll || canOwn;

  const range = { from: new Date(Date.now() - Number(days) * 86_400_000).toISOString() };

  const live = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: () => api.get<RealtimeSnapshot>('/admin/analytics/realtime'),
    enabled: canAnalytics,
    refetchInterval: 5_000,
  });

  const summary = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn: () => api.get<KpiSummary>('/admin/analytics/summary', { query: range }),
    enabled: canAnalytics,
  });

  const operators = useQuery({
    queryKey: ['analytics', 'operators', days],
    queryFn: () => api.get<OperatorStats[]>('/admin/analytics/operators', { query: range }),
    enabled: canAll,
  });

  const hourly = useQuery({
    queryKey: ['analytics', 'hourly', days],
    queryFn: () => api.get<HourlyLoad[]>('/admin/analytics/hourly', { query: range }),
    enabled: canAnalytics,
  });

  const recent = useQuery({
    queryKey: ['calls', 'recent'],
    queryFn: () => api.get<Paged<CallListItem>>('/calls', { query: { pageSize: 8 } }),
  });

  useEffect(
    () =>
      onAiccEvent((event) => {
        if (event.type.startsWith('call.')) {
          void queryClient.invalidateQueries({ queryKey: ['analytics'] });
          void queryClient.invalidateQueries({ queryKey: ['calls'] });
        }
      }),
    [queryClient],
  );

  const kpi = summary.data;
  const snapshot = live.data;
  const peak = Math.max(1, ...(hourly.data?.map((row) => row.total) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Dashboard</h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
            Statistika, analitika va kunlik hisobot
          </p>
        </div>
        <Select className="w-32" value={days} onChange={(event) => setDays(event.target.value)}>
          {RANGES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat icon={PhoneCall} label="Faol" value={String(snapshot?.activeCalls.length ?? 0)} />
        <Stat icon={PhoneCall} label="Jami qo'ng'iroq" value={String(kpi?.totalCalls ?? 0)} />
        <Stat icon={ArrowDownLeft} label="Javob" value={String(kpi?.answeredCalls ?? 0)} />
        <Stat
          icon={PhoneMissed}
          label="O'tkazilgan"
          value={`${Math.round((kpi?.missedRate ?? 0) * 100)}%`}
          tone={(kpi?.missedRate ?? 0) > 0.1 ? 'negative' : 'brand'}
        />
        <Stat icon={Clock} label="AHT" value={formatDuration(kpi?.aht ?? 0)} />
        <Stat
          icon={MessageSquare}
          label="SMS"
          value={`${kpi?.smsDelivered ?? 0}/${kpi?.smsSent ?? 0}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Soatlik yuklama" description="Kunlik taqsimot" />
          {hourly.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <div className="flex h-40 items-end gap-1 px-4 pb-4">
              {(hourly.data ?? Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0 }))).map(
                (row) => (
                  <div key={row.hour} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md bg-[var(--color-brand)]/80"
                      style={{ height: `${Math.max(4, (row.total / peak) * 100)}%` }}
                      title={`${row.hour}:00 — ${row.total}`}
                    />
                    {row.hour % 3 === 0 ? (
                      <span className="text-[9px] text-[var(--color-text-muted)]">{row.hour}</span>
                    ) : (
                      <span className="h-3" />
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Kunlik hisobot"
            description={
              kpi
                ? `${new Date(kpi.from).toLocaleDateString('uz-UZ')} — ${new Date(kpi.to).toLocaleDateString('uz-UZ')}`
                : 'Yuklanmoqda'
            }
          />
          <div className="space-y-3 px-5 py-4 text-sm">
            <ReportRow label="Kiruvchi" value={String(kpi?.inbound ?? 0)} />
            <ReportRow label="Chiquvchi" value={String(kpi?.outbound ?? 0)} />
            <ReportRow label="SLA (≤20s)" value={`${Math.round((kpi?.slaRate ?? 0) * 100)}%`} />
            <ReportRow label="O'rtacha kutish" value={formatDuration(kpi?.avgWaitSec ?? 0)} />
            <ReportRow
              label="Bo'sh operator"
              value={String(snapshot?.operators.AVAILABLE ?? 0)}
            />
            <ReportRow
              label="Qurilmalar"
              value={`${snapshot?.devices.online ?? 0}/${snapshot?.devices.total ?? 0} onlayn`}
            />
          </div>
        </Card>
      </div>

      {canAll ? (
        <Card>
          <CardHeader title="Operatorlar" description="Reyting va holat" />
          {operators.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (operators.data?.length ?? 0) === 0 ? (
            <EmptyState title="Operator yo'q" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border-subtle)] text-left text-xs text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Ism</th>
                    <th className="px-4 py-2 font-medium">Holat</th>
                    <th className="px-4 py-2 font-medium">Qo&apos;ng&apos;iroq</th>
                    <th className="px-4 py-2 font-medium">Javob</th>
                    <th className="px-4 py-2 font-medium">AHT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {operators.data?.map((op) => (
                    <tr key={op.id}>
                      <td className="px-4 py-2.5 font-medium">{op.fullName}</td>
                      <td className="px-4 py-2.5">
                        <Badge>{op.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{op.calls}</td>
                      <td className="px-4 py-2.5 tabular-nums">{op.answered}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{formatDuration(op.aht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Oxirgi suhbatlar"
          action={
            <Link href="/calls" className="text-xs text-[var(--color-brand)] hover:underline">
              Qo&apos;ng&apos;iroqlar
            </Link>
          }
        />
        {recent.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Hali suhbat yo'q" />
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {recent.data?.items.map((call) => (
              <li key={call.id} className="flex items-center justify-between gap-3 px-5 py-3">
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
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {new Date(call.startedAt).toLocaleString('uz-UZ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={call.disposition === 'ANSWERED' ? 'positive' : 'neutral'}>
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

      {!canAnalytics ? (
        <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Users className="size-3.5" /> To&apos;liq analitika uchun ruxsat kerak
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'brand',
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
  tone?: 'brand' | 'negative';
}) {
  const accent = tone === 'negative' ? 'var(--color-negative)' : 'var(--color-brand)';
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div
          className="flex size-8 items-center justify-center rounded-[0.75rem]"
          style={{ background: `color-mix(in oklch, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </div>
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
    </Card>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-2 last:border-0">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
