'use client';

import { useState } from 'react';
import { hasPermission } from '@aicc/shared';
import { useAuthStore } from '@/lib/stores';
import { EmptyState, Tabs } from '@/components/ui';
import { UsersTab } from '@/components/admin/users-tab';
import { QueuesTab } from '@/components/admin/queues-tab';
import { DevicesTab } from '@/components/admin/devices-tab';
import { AuditTab } from '@/components/admin/audit-tab';

type TabKey = 'users' | 'queues' | 'devices' | 'audit';

export default function AdminPage() {
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<TabKey>('users');

  if (!user) return null;

  const tabs: Array<{ value: TabKey; label: string }> = [
    { value: 'users', label: 'Foydalanuvchilar' },
    ...(hasPermission(user.roles, 'queue:manage')
      ? [{ value: 'queues' as const, label: 'Navbatlar' }]
      : []),
    ...(hasPermission(user.roles, 'device:read')
      ? [{ value: 'devices' as const, label: 'Qurilmalar' }]
      : []),
    ...(hasPermission(user.roles, 'audit:read')
      ? [{ value: 'audit' as const, label: 'Audit-jurnal' }]
      : []),
  ];

  const active = tabs.some((item) => item.value === tab) ? tab : tabs[0]?.value;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sozlamalar</h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          Foydalanuvchilar, navbatlar, qurilmalar va xavfsizlik jurnali
        </p>
      </div>

      <Tabs value={active ?? 'users'} items={tabs} onChange={setTab} />

      {active === 'users' ? <UsersTab /> : null}
      {active === 'queues' ? <QueuesTab /> : null}
      {active === 'devices' ? <DevicesTab /> : null}
      {active === 'audit' ? <AuditTab /> : null}
      {active === undefined ? <EmptyState title="Ruxsat yo'q" /> : null}
    </div>
  );
}
