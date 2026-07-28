'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Merge } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { contactName, formatPhone } from '@/lib/utils';
import type { DuplicateGroup } from '@/lib/types';
import { Button, Card, CardHeader, Spinner } from '@/components/ui';

/**
 * Bir xil raqamli kartochkalarni ko'rsatadi. Birlashtirishda tanlangan kartochka
 * asosiy bo'lib qoladi, qolganlarining tarixi unga ko'chadi.
 */
export function DuplicatesPanel({
  groups,
  onMerged,
}: {
  groups: DuplicateGroup[];
  onMerged: () => void;
}) {
  const queryClient = useQueryClient();
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});

  const merge = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      api.post('/contacts/merge', { sourceId, targetId }),
    onSuccess: () => {
      toast.success('Kartochkalar birlashtirildi');
      void queryClient.invalidateQueries({ queryKey: ['contacts', 'duplicates'] });
      onMerged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Duplikat kartochkalar"
        description="Bir xil telefon raqamiga ega yozuvlar"
      />
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {groups.map((group) => {
          const keepId = keepByGroup[group.phoneKey] ?? group.contacts[0]?.id;
          const others = group.contacts.filter((contact) => contact.id !== keepId);

          return (
            <div key={group.phoneKey} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
                {formatPhone(group.phone)}
              </span>

              <div className="flex flex-1 flex-wrap gap-2">
                {group.contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1 text-xs"
                  >
                    <input
                      type="radio"
                      name={`keep-${group.phoneKey}`}
                      checked={contact.id === keepId}
                      onChange={() =>
                        setKeepByGroup((current) => ({ ...current, [group.phoneKey]: contact.id }))
                      }
                    />
                    <span className="font-medium">{contactName(contact)}</span>
                    <span className="text-[var(--color-text-muted)]">
                      {contact._count.calls} qo'ng'iroq
                    </span>
                  </label>
                ))}
              </div>

              <Button
                size="sm"
                variant="secondary"
                disabled={!keepId || others.length === 0 || merge.isPending}
                onClick={() => {
                  if (!keepId) return;
                  // Har safar bittadan birlashtiramiz — natija darhol ko'rinadi.
                  const source = others[0];
                  if (source) merge.mutate({ sourceId: source.id, targetId: keepId });
                }}
              >
                {merge.isPending ? <Spinner /> : <Merge className="size-4" />}
                Birlashtirish
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
