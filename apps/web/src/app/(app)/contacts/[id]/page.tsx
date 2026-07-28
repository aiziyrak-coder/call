'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatMoney, formatPhone, initials } from '@/lib/utils';
import type { ContactDetail } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { ContactTimeline } from '@/components/crm/contact-timeline';
import { ContactFormDialog } from '@/components/crm/contact-form-dialog';
import { TaskFormDialog } from '@/components/crm/task-form-dialog';
import { QuickSmsDialog } from '@/components/sms/quick-sms-dialog';
import { useSoftphone } from '@/components/softphone/softphone-provider';

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const softphone = useSoftphone();

  const [editing, setEditing] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [smsTo, setSmsTo] = useState<string | null>(null);

  const contact = useQuery({
    queryKey: ['contacts', params.id],
    queryFn: () => api.get<ContactDetail>(`/contacts/${params.id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/contacts/${params.id}`),
    onSuccess: () => {
      toast.success("Kartochka o'chirildi");
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      router.push('/contacts');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (contact.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-[var(--color-brand)]" />
      </div>
    );
  }

  if (!contact.data) {
    return <EmptyState title="Kartochka topilmadi" />;
  }

  const data = contact.data;
  const canWrite = user ? hasPermission(user.roles, 'contact:write') : false;
  const canDelete = user ? hasPermission(user.roles, 'contact:delete') : false;
  const canSendSms = user ? hasPermission(user.roles, 'sms:send') : false;
  const primaryPhone = data.phones.find((phone) => phone.isPrimary) ?? data.phones[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Orqaga">
          <ArrowLeft className="size-4" />
        </Button>
        <Link href="/contacts" className="text-xs text-[var(--color-text-muted)] hover:underline">
          Mijozlar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-brand)]/12 text-sm font-semibold text-[var(--color-brand)]">
                {initials(contactName(data) ?? '?')}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold">{contactName(data)}</h1>
                {data.company ? (
                  <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                    <Building2 className="size-3" /> {data.company}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {data.tags.map((tag) => (
                    <Badge key={tag} tone="brand">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--color-border-subtle)] px-5 py-4 text-sm">
              {data.phones.map((phone) => (
                <div key={phone.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
                    <Phone className="size-3.5 text-[var(--color-text-muted)]" />
                    {formatPhone(phone.phone)}
                    {phone.label ? (
                      <span className="text-[var(--color-text-muted)]">{phone.label}</span>
                    ) : null}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!softphone.ready}
                      onClick={() => void softphone.dial(phone.phone)}
                    >
                      Qo'ng'iroq
                    </Button>
                    {canSendSms ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="SMS yuborish"
                        onClick={() => setSmsTo(phone.phone)}
                      >
                        <MessageSquare className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}

              {data.email ? (
                <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Mail className="size-3.5" /> {data.email}
                </p>
              ) : null}
              {data.address ? (
                <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <MapPin className="size-3.5" /> {data.address}
                </p>
              ) : null}
            </div>

            {data.notes ? (
              <p className="whitespace-pre-wrap border-t border-[var(--color-border-subtle)] px-5 py-3 text-xs text-[var(--color-text-muted)]">
                {data.notes}
              </p>
            ) : null}

            <div className="flex gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
              {canWrite ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Tahrirlash
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Kartochka butunlay o'chiriladi. Davom etamizmi?")) {
                      remove.mutate();
                    }
                  }}
                >
                  <Trash2 className="size-4" /> O'chirish
                </Button>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Bitimlar" />
            {data.deals.length === 0 ? (
              <EmptyState title="Bitim yo'q" />
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {data.deals.map((deal) => (
                  <li key={deal.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{deal.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {formatMoney(deal.amount, deal.currency)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        deal.stage.kind === 'WON'
                          ? 'positive'
                          : deal.stage.kind === 'LOST'
                            ? 'negative'
                            : 'neutral'
                      }
                    >
                      {deal.stage.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Vazifalar"
              action={
                <Button size="sm" variant="ghost" onClick={() => setAddingTask(true)}>
                  <Plus className="size-4" />
                </Button>
              }
            />
            {data.tasks.length === 0 ? (
              <EmptyState title="Ochiq vazifa yo'q" />
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {data.tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <span className="truncate text-sm">{task.title}</span>
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                      {task.dueAt ? new Date(task.dueAt).toLocaleDateString('uz-UZ') : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <ContactTimeline contactId={data.id} />
      </div>

      {editing ? (
        <ContactFormDialog
          contact={data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ['contacts', params.id] });
          }}
        />
      ) : null}

      {addingTask ? (
        <TaskFormDialog
          contactId={data.id}
          onClose={() => setAddingTask(false)}
          onSaved={() => {
            setAddingTask(false);
            void queryClient.invalidateQueries({ queryKey: ['contacts', params.id] });
          }}
        />
      ) : null}

      {smsTo ? (
        <QuickSmsDialog
          contactId={data.id}
          phones={[
            smsTo,
            ...data.phones.map((phone) => phone.phone).filter((phone) => phone !== smsTo),
          ]}
          onClose={() => setSmsTo(null)}
        />
      ) : null}

      {primaryPhone ? null : (
        <p className="text-xs text-[var(--color-text-muted)]">
          Bu kartochkada telefon raqami yo'q — kiruvchi qo'ng'iroqda avtomatik topilmaydi.
        </p>
      )}
    </div>
  );
}
