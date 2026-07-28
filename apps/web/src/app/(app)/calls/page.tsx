'use client';

import dynamic from 'next/dynamic';
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { contactName, formatDuration, formatPhone } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from '@/components/ui';
import { CallTranscript } from '@/components/ai/call-transcript';
import type { CallListItem, Paged } from '@/lib/types';

const RecordingPlayer = dynamic(
  () => import('@/components/recording-player').then((mod) => mod.RecordingPlayer),
  { ssr: false, loading: () => <Spinner className="size-4 text-[var(--color-brand)]" /> },
);

const DISPOSITION_TONES: Record<string, 'positive' | 'negative' | 'warning' | 'neutral'> = {
  ANSWERED: 'positive',
  NO_ANSWER: 'warning',
  BUSY: 'warning',
  ABANDONED: 'negative',
  FAILED: 'negative',
  VOICEMAIL: 'neutral',
};

export default function CallsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [disposition, setDisposition] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['calls', 'history', { page, search, direction, disposition }],
    queryFn: () =>
      api.get<Paged<CallListItem>>('/calls', {
        query: { page, pageSize: 25, search, direction, disposition },
      }),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Qo&apos;ng&apos;iroqlar tarixi</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {query.data ? `Jami ${query.data.total} ta yozuv` : 'Yuklanmoqda...'}
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Raqam bo'yicha qidirish"
            className="pl-9"
          />
        </div>
        <Select
          value={direction}
          onChange={(event) => {
            setDirection(event.target.value);
            setPage(1);
          }}
          className="w-40"
          aria-label="Yo'nalish"
        >
          <option value="">Barcha yo&apos;nalish</option>
          <option value="INBOUND">Kiruvchi</option>
          <option value="OUTBOUND">Chiquvchi</option>
          <option value="INTERNAL">Ichki</option>
        </Select>
        <Select
          value={disposition}
          onChange={(event) => {
            setDisposition(event.target.value);
            setPage(1);
          }}
          className="w-44"
          aria-label="Natija"
        >
          <option value="">Barcha natija</option>
          <option value="ANSWERED">Javob berilgan</option>
          <option value="NO_ANSWER">Javobsiz</option>
          <option value="ABANDONED">Tashlab ketilgan</option>
          <option value="BUSY">Band</option>
          <option value="FAILED">Xato</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {query.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" hint="Filtrlarni o'zgartirib ko'ring" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border-subtle)] text-left text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Yo&apos;nalish</th>
                <th className="px-4 py-2.5 font-medium">Mijoz / raqam</th>
                <th className="px-4 py-2.5 font-medium">Operator</th>
                <th className="px-4 py-2.5 font-medium">Boshlangan</th>
                <th className="px-4 py-2.5 font-medium">Suhbat</th>
                <th className="px-4 py-2.5 font-medium">Natija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {items.map((call) => (
                <Fragment key={call.id}>
                  <tr
                    onClick={() => setExpanded(expanded === call.id ? null : call.id)}
                    className="cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-2.5">
                      {call.direction === 'INBOUND' ? (
                        <ArrowDownLeft className="size-4 text-[var(--color-positive)]" />
                      ) : (
                        <ArrowUpRight className="size-4 text-[var(--color-brand)]" />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div>{contactName(call.contact) ?? '—'}</div>
                      <div className="font-mono text-xs text-[var(--color-text-muted)]">
                        {formatPhone(
                          call.direction === 'INBOUND' ? call.fromNumber : call.toNumber,
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                      {call.operator?.fullName ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                      {new Date(call.startedAt).toLocaleString('uz-UZ')}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {formatDuration(call.talkTimeSec)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={DISPOSITION_TONES[call.disposition ?? ''] ?? 'neutral'}>
                        {call.disposition ?? call.state}
                      </Badge>
                    </td>
                  </tr>
                  {expanded === call.id ? (
                    <tr>
                      <td colSpan={6} className="bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]">
                        <div className="space-y-3">
                          {call.recording ? (
                            <RecordingPlayer callId={call.id} recording={call.recording} />
                          ) : (
                            <p className="text-xs text-[var(--color-text-muted)]">
                              Bu qo&apos;ng&apos;iroq uchun yozuv mavjud emas
                            </p>
                          )}
                          <CallTranscript callId={call.id} />
                          {call.notes ? (
                            <p className="text-xs">
                              <span className="text-[var(--color-text-muted)]">Izoh: </span>
                              {call.notes}
                            </p>
                          ) : null}
                          <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
                            <span>Kutish: {formatDuration(call.waitTimeSec)}</span>
                            <span>Umumiy: {formatDuration(call.durationSec)}</span>
                            {call.queue ? <span>Navbat: {call.queue.name}</span> : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {query.data && query.data.pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Oldingi
          </Button>
          <span className="text-xs text-[var(--color-text-muted)]">
            {page} / {query.data.pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= query.data.pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Keyingi
          </Button>
        </div>
      ) : null}
    </div>
  );
}
