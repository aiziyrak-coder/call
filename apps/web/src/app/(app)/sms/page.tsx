'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { countSmsSegments, hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { cn, contactName, formatPhone, timeAgo } from '@/lib/utils';
import type { Paged, ProviderStatus, SmsMessage, SmsStatus, SmsTemplate } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { BulkSmsDialog } from '@/components/sms/bulk-sms-dialog';

const STATUS_TONE: Record<SmsStatus, 'neutral' | 'brand' | 'positive' | 'warning' | 'negative'> = {
  QUEUED: 'neutral',
  SENDING: 'brand',
  SENT: 'brand',
  DELIVERED: 'positive',
  FAILED: 'negative',
  RECEIVED: 'positive',
};

export default function SmsPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const canBulk = user ? hasPermission(user.roles, 'sms:bulk') : false;
  const canSeeProviders = user ? hasPermission(user.roles, 'sms:read:all') : false;

  const messages = useQuery({
    queryKey: ['sms'],
    queryFn: () => api.get<Paged<SmsMessage>>('/sms', { query: { pageSize: 50 } }),
  });

  const templates = useQuery({
    queryKey: ['sms', 'templates'],
    queryFn: () => api.get<SmsTemplate[]>('/sms/templates'),
    staleTime: 5 * 60_000,
  });

  const providers = useQuery({
    queryKey: ['sms', 'providers'],
    queryFn: () => api.get<ProviderStatus[]>('/sms/providers'),
    enabled: canSeeProviders,
    refetchInterval: 60_000,
  });

  // Kiruvchi SMS va status o'zgarishi ro'yxatni darhol yangilaydi.
  useEffect(
    () =>
      onAiccEvent((event) => {
        if (event.type === 'sms.received') {
          toast.info(`Yangi SMS: ${event.from}`);
          void queryClient.invalidateQueries({ queryKey: ['sms'] });
        }
        if (event.type === 'sms.status') {
          void queryClient.invalidateQueries({ queryKey: ['sms'] });
        }
      }),
    [queryClient],
  );

  const send = useMutation({
    mutationFn: () =>
      api.post<SmsMessage>('/sms', {
        to: to.trim(),
        text: templateId ? undefined : text.trim(),
        templateId: templateId || undefined,
      }),
    onSuccess: () => {
      toast.success("SMS navbatga qo'yildi");
      setText('');
      setTemplateId('');
      void queryClient.invalidateQueries({ queryKey: ['sms'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedTemplate = templates.data?.find((template) => template.id === templateId);
  const body = selectedTemplate?.body ?? text;
  const { segments, encoding } = countSmsSegments(body);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">SMS</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Android qurilma, GSM-shlyuz yoki Eskiz.uz orqali
          </p>
        </div>

        <div className="flex items-center gap-2">
          {providers.data?.map((provider) => (
            <Badge
              key={provider.name}
              tone={provider.healthy ? 'positive' : 'neutral'}
              title={provider.detail}
            >
              {provider.name}
            </Badge>
          ))}
          {canBulk ? (
            <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
              <Users className="size-4" /> Ommaviy
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Yangi xabar" />
          <div className="space-y-3 px-5 py-4">
            <Field label="Kimga">
              <Input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="+998 90 123 45 67"
              />
            </Field>

            {(templates.data?.length ?? 0) > 0 ? (
              <Field label="Shablon">
                <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  <option value="">Shablonsiz</option>
                  {templates.data?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field
              label="Matn"
              hint={body ? `${body.length} belgi · ${segments} segment · ${encoding}` : undefined}
            >
              <Textarea
                rows={5}
                value={selectedTemplate ? selectedTemplate.body : text}
                disabled={Boolean(selectedTemplate)}
                onChange={(event) => setText(event.target.value)}
                placeholder="Xabar matni..."
              />
            </Field>

            <Button
              className="w-full"
              disabled={!to.trim() || (!text.trim() && !templateId) || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? <Spinner /> : <Send className="size-4" />} Yuborish
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Xabarlar" description="Kiruvchi va chiquvchi SMS lar" />

          {messages.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5 text-[var(--color-brand)]" />
            </div>
          ) : (messages.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="Xabar yo'q" hint="Birinchi SMS ni yuboring" />
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {messages.data?.items.map((message) => {
                const inbound = message.direction === 'INBOUND';
                const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
                const peer = inbound ? message.fromNumber : message.toNumber;

                return (
                  <li key={message.id} className="flex gap-3 px-5 py-3">
                    <div
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                        inbound
                          ? 'bg-[var(--color-positive)]/15 text-[var(--color-positive)]'
                          : 'bg-[var(--color-brand)]/12 text-[var(--color-brand)]',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {message.contact ? (
                          <Link
                            href={`/contacts/${message.contact.id}`}
                            className="text-sm font-medium text-[var(--color-brand)] hover:underline"
                          >
                            {contactName(message.contact)}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs tabular-nums">
                            {formatPhone(peer)}
                          </span>
                        )}

                        <Badge tone={STATUS_TONE[message.status]}>{message.status}</Badge>
                        {message.provider ? (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {message.provider}
                          </span>
                        ) : null}
                        {message.segments > 1 ? (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {message.segments} segment
                          </span>
                        ) : null}

                        <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                          {timeAgo(message.createdAt)}
                        </span>
                      </div>

                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                        {message.text}
                      </p>

                      {message.error ? (
                        <p className="mt-1 text-xs text-[var(--color-negative)]">{message.error}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {bulkOpen ? (
        <BulkSmsDialog
          templates={templates.data ?? []}
          onClose={() => setBulkOpen(false)}
          onSent={() => {
            setBulkOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['sms'] });
          }}
        />
      ) : null}
    </div>
  );
}
