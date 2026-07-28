'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import type { AuditEntry, Paged } from '@/lib/types';
import { Badge, Card, CardHeader, EmptyState, Input, Spinner } from '@/components/ui';

export function AuditTab() {
  const [action, setAction] = useState('');

  const entries = useQuery({
    queryKey: ['admin', 'audit', action],
    queryFn: () =>
      api.get<Paged<AuditEntry>>('/admin/audit', {
        query: { action: action || undefined, pageSize: 100 },
      }),
  });

  return (
    <Card>
      <CardHeader title="Audit-jurnal" description="Tizimdagi muhim harakatlarning to'liq tarixi" />

      <div className="px-5 py-3">
        <div className="relative max-w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            className="pl-9"
            placeholder="Harakat bo'yicha: user.create, call.listen"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
        </div>
      </div>

      {entries.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-[var(--color-brand)]" />
        </div>
      ) : (entries.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Yozuv yo'q" />
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {entries.data?.items.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
              <span className="font-mono text-xs">{entry.action}</span>

              <Badge tone={entry.success ? 'neutral' : 'negative'}>{entry.resource}</Badge>

              <span className="min-w-32 flex-1 truncate text-xs text-[var(--color-text-muted)]">
                {entry.user ? entry.user.fullName : 'tizim'}
                {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
              </span>

              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
