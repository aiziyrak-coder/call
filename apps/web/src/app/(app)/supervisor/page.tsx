'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Ear,
  MessageCircle,
  PhoneCall,
  PhoneMissed,
  Smartphone,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatDuration, formatPhone } from '@/lib/utils';
import type { HourlyLoad, KpiSummary, OperatorStats, RealtimeSnapshot } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Select, Spinner } from '@/components/ui';

const RANGES = [
  { value: '1', label: 'Bugun' },
  { value: '7', label: '7 kun' },
  { value: '30', label: '30 kun' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Bo'sh",
  ON_CALL: 'Suhbatda',
  AFTER_CALL_WORK: 'Qayta ishlash',
  BREAK: 'Tanaffus',
  OFFLINE: 'Oflayn',
};

export default function SupervisorPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [days, setDays] = useState<string>('1');

  const canListen = user ? hasPermission(user.roles, 'call:listen') : false;
  const range = { from: new Date(Date.now() - Number(days) * 86_400_000).toISOString() };

  const live = useQuery({
    queryKey: ['analytics', 'realtime'],
    queryFn: () => api.get<RealtimeSnapshot>('/admin/analytics/realtime'),
    refetchInterval: 5_000,
  });

  const summary = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn: () => api.get<KpiSummary>('/admin/analytics/summary', { query: range }),
  });

  const operators = useQuery({
    queryKey: ['analytics', 'operators', days],
    queryFn: () => api.get<OperatorStats[]>('/admin/analytics/operators', { query: range }),
  });

  const hourly = useQuery({
    queryKey: ['analytics', 'hourly', days],
    queryFn: () => api.get<HourlyLoad[]>('/admin/analytics/hourly', { query: range }),
  });

  useEffect(
    () =>
      onAiccEvent((event) => {
        if (event.type.startsWith('call.')) {
          void queryClient.invalidateQueries({ queryKey: ['analytics', 'realtime'] });
        }
      }),
    [queryClient],
  );

  const snapshot = live.data;
  const kpi = summary.data;
  const peak = Math.max(1, ...(hourly.data?.map((row) => row.total) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Jonli devor</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Faol suhbatlar, operatorlar holati va KPI ko'rsatkichlari
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat
          icon={PhoneCall}
          label="Faol suhbat"
          value={String(snapshot?.activeCalls.length ?? 0)}
        />
        <Stat icon={Clock} label="Navbatda" value={String(snapshot?.queuedCalls ?? 0)} />
        <Stat
          icon={Users}
          label="Bo'sh operator"
          value={String(snapshot?.operators.AVAILABLE ?? 0)}
        />
        <Stat icon={Clock} label="AHT" value={formatDuration(kpi?.aht ?? 0)} />
        <Stat
          icon={PhoneMissed}
          label="O'tkazib yuborilgan"
          value={`${Math.round((kpi?.missedRate ?? 0) * 100)}%`}
          tone={(kpi?.missedRate ?? 0) > 0.1 ? 'negative' : 'brand'}
        />
        <Stat
          icon={MessageCircle}
          label="SLA"
          value={`${Math.round((kpi?.slaRate ?? 0) * 100)}%`}
          tone={(kpi?.slaRate ?? 1) < 0.8 ? 'negative' : 'brand'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="Faol suhbatlar"
            description="Har 5 soniyada yangilanadi"
            action={
              snapshot?.devices ? (
                <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                  <Smartphone className="size-3.5" />
                  {snapshot.devices.online}/{snapshot.devices.total} qurilma onlayn
                </span>
              ) : null
            }
          />

          {live.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5 text-[var(--color-brand)]" />
            </div>
          ) : (snapshot?.activeCalls.length ?? 0) === 0 ? (
            <EmptyState title="Hozir faol suhbat yo'q" />
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {snapshot?.activeCalls.map((call) => {
                const inbound = call.direction === 'INBOUND';
                const started = new Date(call.answeredAt ?? call.startedAt).getTime();
                const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));

                return (
                  <li key={call.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    {inbound ? (
                      <ArrowDownLeft className="size-4 text-[var(--color-positive)]" />
                    ) : (
                      <ArrowUpRight className="size-4 text-[var(--color-brand)]" />
                    )}

                    <div className="min-w-36 flex-1">
                      <p className="text-sm">
                        {contactName(call.contact) ??
                          formatPhone(inbound ? call.fromNumber : call.toNumber)}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {call.operator?.fullName ?? 'operator biriktirilmagan'}
                        {call.queue ? ` · ${call.queue.name}` : ''}
                      </p>
                    </div>

                    <Badge tone={call.state === 'ANSWERED' ? 'positive' : 'brand'}>
                      {call.state}
                    </Badge>

                    <span className="font-mono text-sm tabular-nums text-[var(--color-text-muted)]">
                      {formatDuration(seconds)}
                    </span>

                    {canListen ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toast.info('Tinglash 2-bosqichda AI moduli bilan birga yoqiladi')
                        }
                      >
                        <Ear className="size-4" /> Tinglash
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Operatorlar holati" />
            <ul className="space-y-2 px-5 py-4 text-sm">
              {Object.entries(STATUS_LABEL).map(([status, label]) => (
                <li key={status} className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">{label}</span>
                  <span className="tabular-nums">{snapshot?.operators[status as never] ?? 0}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Soatlik yuklama" description="Qo'ng'iroqlar taqsimoti" />
            <div className="flex h-32 items-end gap-0.5 px-5 py-4">
              {(hourly.data ?? []).map((row) => (
                <div
                  key={row.hour}
                  className="flex-1 rounded-t bg-[var(--color-brand)]/25"
                  style={{ height: `${Math.max(2, (row.total / peak) * 100)}%` }}
                  title={`${row.hour}:00 — ${row.total} ta (${row.answered} javob berilgan)`}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Operatorlar reytingi" description="Tanlangan davr uchun" />

        {operators.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-5 text-[var(--color-brand)]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--color-text-muted)]">
                <tr className="border-y border-[var(--color-border-subtle)]">
                  <th className="px-5 py-2 font-medium">Operator</th>
                  <th className="px-3 py-2 font-medium">Holat</th>
                  <th className="px-3 py-2 text-right font-medium">Qo'ng'iroq</th>
                  <th className="px-3 py-2 text-right font-medium">Javob berilgan</th>
                  <th className="px-3 py-2 text-right font-medium">AHT</th>
                  <th className="px-3 py-2 text-right font-medium">Suhbat vaqti</th>
                  <th className="px-5 py-2 text-right font-medium">Tanaffus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {operators.data?.map((operator) => (
                  <tr key={operator.id}>
                    <td className="px-5 py-2.5">{operator.fullName}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={operator.status === 'AVAILABLE' ? 'positive' : 'neutral'}>
                        {STATUS_LABEL[operator.status] ?? operator.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{operator.calls}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{operator.answered}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatDuration(operator.aht)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatDuration(operator.talkTimeSec)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {formatDuration(operator.breakSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <Icon
          className={
            tone === 'negative'
              ? 'size-3.5 text-[var(--color-negative)]'
              : 'size-3.5 text-[var(--color-brand)]'
          }
        />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
