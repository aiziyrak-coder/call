'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, PhoneIncoming, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatDateTime, formatPhone, initials } from '@/lib/utils';
import type { ScreenPop as ScreenPopData } from '@/lib/types';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { ContactFormDialog } from '@/components/crm/contact-form-dialog';

/**
 * Kiruvchi qo'ng'iroq kelishi bilan mijoz kartochkasini ekranga chiqaradi
 * (screen-pop). Kartochka topilmasa — bir bosishda yangisini yaratish taklif etiladi.
 */
export function ScreenPop() {
  const user = useAuthStore((state) => state.user);
  const [phone, setPhone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;

    return onAiccEvent((event) => {
      if (event.type === 'call.ringing' && event.operatorId === user.id) {
        setPhone(event.direction === 'INBOUND' ? event.from : event.to);
        setDismissed(false);
      }
      // Suhbat tugagach kartochka o'z-o'zidan yopiladi.
      if (event.type === 'call.ended') setPhone(null);
    });
  }, [user]);

  const lookup = useQuery({
    queryKey: ['screen-pop', phone],
    queryFn: () => api.get<ScreenPopData | null>('/contacts/lookup', { query: { phone: phone! } }),
    enabled: Boolean(phone) && !dismissed,
    staleTime: 30_000,
  });

  if (!phone || dismissed) return null;

  const data = lookup.data;

  return (
    <>
      <Card className="fixed bottom-4 right-4 z-40 w-80 animate-sheet-up shadow-[0_20px_50px_oklch(30%_0.04_250_/_0.2)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-brand)]">
            <PhoneIncoming className="size-3.5" strokeWidth={2.25} /> Kiruvchi qo'ng'iroq
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Yopish"
            className="pressable flex size-8 items-center justify-center rounded-full bg-black/[0.04] text-[var(--color-text-muted)] dark:bg-white/10"
          >
            <X className="size-3.5" strokeWidth={2.25} />
          </button>
        </div>

        {lookup.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-[var(--color-brand)]" />
          </div>
        ) : data ? (
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-brand)]/12 text-xs font-semibold text-[var(--color-brand)]">
                {initials(contactName(data.contact) ?? '?')}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/contacts/${data.contact.id}`}
                  className="block truncate text-sm font-medium text-[var(--color-brand)] hover:underline"
                >
                  {contactName(data.contact)}
                </Link>
                <p className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
                  {formatPhone(phone)}
                </p>
                {data.contact.company ? (
                  <p className="flex items-center gap-1 truncate text-xs text-[var(--color-text-muted)]">
                    <Building2 className="size-3" /> {data.contact.company}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {data.contact.tags.map((tag) => (
                <Badge key={tag} tone="brand">
                  {tag}
                </Badge>
              ))}
              {data.openTasks > 0 ? (
                <Badge tone="warning">
                  <ClipboardList className="size-3" /> {data.openTasks} vazifa
                </Badge>
              ) : null}
              {data.openDeals > 0 ? <Badge>{data.openDeals} ochiq bitim</Badge> : null}
            </div>

            {data.lastCall ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                Oxirgi aloqa: {formatDateTime(data.lastCall.startedAt)} (
                {data.lastCall.disposition ?? '—'})
                {data.lastCall.notes ? (
                  <span className="mt-1 block italic">{data.lastCall.notes}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">Avval bog'lanilmagan</p>
            )}

            <Link href={`/contacts/${data.contact.id}`}>
              <Button size="sm" className="w-full">
                Kartochkani ochish
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3 px-4 py-4">
            <p className="font-mono text-sm tabular-nums">{formatPhone(phone)}</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Bu raqam bazada yo'q — suhbat davomida yangi kartochka ochishingiz mumkin.
            </p>
            <Button size="sm" className="w-full" onClick={() => setCreating(true)}>
              <UserPlus className="size-4" /> Kartochka yaratish
            </Button>
          </div>
        )}
      </Card>

      {creating ? (
        <ContactFormDialog
          initialPhone={phone}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void lookup.refetch();
          }}
        />
      ) : null}
    </>
  );
}
