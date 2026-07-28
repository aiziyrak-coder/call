'use client';

import { Fragment, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Headphones,
  Play,
  Plus,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore, useCallStore } from '@/lib/stores';
import { contactName, formatDuration, formatPhone } from '@/lib/utils';
import { CallTranscript } from '@/components/ai/call-transcript';
import { CallNotesEditor } from '@/components/crm/call-notes-editor';
import { SoftphonePanel } from '@/components/softphone/softphone-panel';
import { LiveTranscriptPanel } from '@/components/ai/live-transcript';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from '@/components/ui';
import type { ActiveCall, CallListItem, Paged } from '@/lib/types';

const RecordingPlayer = dynamic(
  () => import('@/components/recording-player').then((mod) => mod.RecordingPlayer),
  { ssr: false, loading: () => <Spinner className="size-4 text-[var(--color-brand)]" /> },
);

type TabKey = 'ai' | 'center';

interface Campaign {
  id: string;
  name: string;
  goal: string;
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'DONE';
  createdAt: string;
  pending: number;
  done: number;
  failed: number;
  leads: Array<{ phone: string; status: string; qualification?: string; error?: string }>;
}

const DISPOSITION_TONES: Record<string, 'positive' | 'negative' | 'warning' | 'neutral'> = {
  ANSWERED: 'positive',
  NO_ANSWER: 'warning',
  BUSY: 'warning',
  ABANDONED: 'negative',
  FAILED: 'negative',
  VOICEMAIL: 'neutral',
};

export default function CallsPage() {
  const user = useAuthStore((state) => state.user);
  const activeCalls = useCallStore((state) => state.activeCalls);
  const [tab, setTab] = useState<TabKey>('center');

  const canOriginate = user ? hasPermission(user.roles, 'call:originate') : false;
  const canListen = user ? hasPermission(user.roles, 'call:listen') : false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Qo&apos;ng&apos;iroqlar</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          AI avto-suhbat va haqiqiy call-markaz
        </p>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'center', label: 'Call markaz' },
          { value: 'ai', label: 'AI suhbatlar' },
        ]}
      />

      {tab === 'center' ? <CallCenterTab canListen={canListen} activeCount={activeCalls.size} /> : null}
      {tab === 'ai' ? <AiCampaignsTab canOriginate={canOriginate} /> : null}
    </div>
  );
}

function CallCenterTab({
  canListen,
  activeCount,
}: {
  canListen: boolean;
  activeCount: number;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [disposition, setDisposition] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeQuery = useQuery({
    queryKey: ['calls', 'active'],
    queryFn: () => api.get<ActiveCall[]>('/calls/active'),
    refetchInterval: 5_000,
    enabled: canListen,
  });

  const query = useQuery({
    queryKey: ['calls', 'history', { page, search, direction, disposition }],
    queryFn: () =>
      api.get<Paged<CallListItem>>('/calls', {
        query: { page, pageSize: 25, search, direction, disposition },
      }),
  });

  useEffect(
    () =>
      onAiccEvent((event) => {
        if (event.type.startsWith('call.')) {
          void queryClient.invalidateQueries({ queryKey: ['calls'] });
        }
      }),
    [queryClient],
  );

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_21rem]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Headphones className="size-4 text-[var(--color-brand)]" />
                Jonli: {canListen ? (activeQuery.data?.length ?? 0) : activeCount}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                AI suhbatni eshitadi, real-time tavsiya o&apos;ng panelda
              </p>
            </div>
            {canListen && (activeQuery.data?.length ?? 0) > 0 ? (
              <ul className="mt-3 divide-y divide-[var(--color-border-subtle)]">
                {activeQuery.data?.map((call) => (
                  <li key={call.callId} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono">
                      {formatPhone(call.direction === 'INBOUND' ? call.from : call.to)}
                    </span>
                    <Badge>{call.state}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

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
            >
              <option value="">Barcha yo&apos;nalish</option>
              <option value="INBOUND">Kiruvchi</option>
              <option value="OUTBOUND">Chiquvchi</option>
            </Select>
            <Select
              value={disposition}
              onChange={(event) => {
                setDisposition(event.target.value);
                setPage(1);
              }}
              className="w-44"
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
              <EmptyState title="Hech narsa topilmadi" />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border-subtle)] text-left text-xs text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Yo&apos;nalish</th>
                    <th className="px-4 py-2.5 font-medium">Mijoz / raqam</th>
                    <th className="px-4 py-2.5 font-medium">Operator</th>
                    <th className="px-4 py-2.5 font-medium">Suhbat</th>
                    <th className="px-4 py-2.5 font-medium">Natija</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {items.map((call) => (
                    <Fragment key={call.id}>
                      <tr
                        onClick={() => setExpanded(expanded === call.id ? null : call.id)}
                        className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
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
                          <td colSpan={5} className="bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]">
                            <div className="space-y-3">
                              {call.recording ? (
                                <RecordingPlayer callId={call.id} recording={call.recording} />
                              ) : null}
                              <CallTranscript callId={call.id} />
                              <CallNotesEditor callId={call.id} initialNotes={call.notes} />
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

        <div className="space-y-4 xl:hidden">
          <SoftphonePanel />
          <LiveTranscriptPanel />
        </div>
      </div>
    </div>
  );
}

function AiCampaignsTab({ canOriginate }: { canOriginate: boolean }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phones, setPhones] = useState('');
  const [goal, setGoal] = useState('');

  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/admin/campaigns'),
    enabled: canOriginate,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/campaigns', {
        name,
        goal: goal || undefined,
        phones: phones
          .split(/[\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('AI kampaniya yaratildi');
      setCreating(false);
      setName('');
      setPhones('');
      setGoal('');
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const start = useMutation({
    mutationFn: (id: string) => api.post(`/admin/campaigns/${id}/start`),
    onSuccess: () => {
      toast.success("AI qo'ng'iroqlar boshlandi");
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canOriginate) {
    return (
      <EmptyState
        title="AI suhbatlar uchun ruxsat yo'q"
        hint="Administratordan call:originate huquqini so'rang"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-[var(--color-brand)]/12 text-[var(--color-brand)]">
              <Bot className="size-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="font-semibold">AI o&apos;zi qo&apos;ng&apos;iroq qiladi</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Biznes profili va narxlar Sozlamalardan olinadi. Har suhbat tahlil qilinadi, mijoz
                saralanadi.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Yangi kampaniya
          </Button>
        </div>
      </Card>

      {campaigns.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (campaigns.data?.length ?? 0) === 0 ? (
        <EmptyState title="Kampaniya yo'q" hint="Raqamlar ro'yxati bilan AI kampaniya yarating" />
      ) : (
        <div className="space-y-3">
          {campaigns.data?.map((campaign) => (
            <Card key={campaign.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{campaign.name}</p>
                    <Badge
                      tone={
                        campaign.status === 'RUNNING'
                          ? 'positive'
                          : campaign.status === 'DONE'
                            ? 'neutral'
                            : 'brand'
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{campaign.goal}</p>
                  <p className="mt-2 text-xs tabular-nums text-[var(--color-text-muted)]">
                    Kutilmoqda {campaign.pending} · Tayyor {campaign.done} · Xato {campaign.failed}
                  </p>
                </div>
                {campaign.status !== 'DONE' ? (
                  <Button
                    size="sm"
                    disabled={start.isPending}
                    onClick={() => start.mutate(campaign.id)}
                  >
                    <Play className="size-4" /> Ishga tushirish
                  </Button>
                ) : null}
              </div>
              {campaign.leads?.length ? (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {campaign.leads.slice(0, 20).map((lead) => (
                    <li key={lead.phone} className="flex justify-between gap-2 font-mono">
                      <span>{formatPhone(lead.phone)}</span>
                      <span className="text-[var(--color-text-muted)]">
                        {lead.qualification ?? lead.status}
                        {lead.error ? ` — ${lead.error}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <Dialog
          title="AI kampaniya"
          description="Raqamlar ro'yxati — har qator yoki vergul bilan"
          onClose={() => setCreating(false)}
          footer={
            <Button
              disabled={!name.trim() || !phones.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Yaratish
            </Button>
          }
        >
          <div className="space-y-3">
            <Field label="Nomi">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Maqsad (AI uchun)">
              <Textarea
                rows={2}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Masalan: yangi tarifni taklif qilish"
              />
            </Field>
            <Field label="Telefon raqamlar">
              <Textarea
                rows={6}
                value={phones}
                onChange={(event) => setPhones(event.target.value)}
                placeholder={'+998901234567\n+998909876543'}
                className="font-mono"
              />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
