'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Spinner,
  Tabs,
  Textarea,
} from '@/components/ui';
import { UsersTab } from '@/components/admin/users-tab';
import { QueuesTab } from '@/components/admin/queues-tab';
import { DevicesTab } from '@/components/admin/devices-tab';
import { AuditTab } from '@/components/admin/audit-tab';
import { CompanionSetupGuide } from '@/components/settings/companion-setup-guide';

type TabKey = 'business' | 'users' | 'phone' | 'queues' | 'audit' | 'profile';

interface TenantSettings {
  tenantId: string;
  name: string;
  businessProfile: string;
  priceList: Array<{ name: string; price: string; unit?: string; note?: string }>;
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<TabKey>('phone');

  const canUsers = user ? hasPermission(user.roles, 'user:read') : false;
  const canBusiness = user
    ? hasPermission(user.roles, 'knowledge:manage') || hasPermission(user.roles, 'tenant:manage')
    : false;
  const canQueues = user ? hasPermission(user.roles, 'queue:manage') : false;
  const canDevices = user ? hasPermission(user.roles, 'device:read') : false;
  const canAudit = user ? hasPermission(user.roles, 'audit:read') : false;
  const isOperatorOnly = Boolean(user) && !canUsers && !canBusiness;

  const tabs = useMemo(() => {
    const items: Array<{ value: TabKey; label: string }> = [];
    if (canBusiness) items.push({ value: 'business', label: 'Biznes' });
    if (canUsers) items.push({ value: 'users', label: 'Operatorlar' });
    items.push({ value: 'phone', label: 'Telefon' });
    if (canQueues) items.push({ value: 'queues', label: 'Navbatlar' });
    if (canAudit) items.push({ value: 'audit', label: 'Audit' });
    if (isOperatorOnly) items.push({ value: 'profile', label: 'Profil' });
    return items;
  }, [canBusiness, canUsers, canQueues, canAudit, isOperatorOnly]);

  const active = tabs.some((item) => item.value === tab) ? tab : tabs[0]?.value ?? 'phone';

  useEffect(() => {
    if (active !== tab) setTab(active);
  }, [active, tab]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Sozlamalar</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Biznes ma&apos;lumoti, operatorlar va telefon bog&apos;lash
        </p>
      </div>

      <Tabs value={active} items={tabs} onChange={setTab} />

      {active === 'business' ? <BusinessTab /> : null}
      {active === 'users' ? <UsersTab /> : null}
      {active === 'phone' ? <PhoneTab showManage={canDevices} /> : null}
      {active === 'queues' ? <QueuesTab /> : null}
      {active === 'audit' ? <AuditTab /> : null}
      {active === 'profile' ? <ProfileTab /> : null}
      {tabs.length === 0 ? <EmptyState title="Ruxsat yo'q" /> : null}
    </div>
  );
}

function BusinessTab() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get<TenantSettings>('/admin/tenant-settings'),
  });

  const [profile, setProfile] = useState('');
  const [priceText, setPriceText] = useState('');

  useEffect(() => {
    if (!settings.data) return;
    setProfile(settings.data.businessProfile);
    setPriceText(
      settings.data.priceList
        .map((item) =>
          [item.name, item.price, item.unit, item.note].filter(Boolean).join(' | '),
        )
        .join('\n'),
    );
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      const priceList = priceText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, price, unit, note] = line.split('|').map((part) => part.trim());
          return {
            name: name || 'Mahsulot',
            price: price || '0',
            unit: unit || undefined,
            note: note || undefined,
          };
        });
      return api.patch('/admin/tenant-settings', {
        businessProfile: profile,
        priceList,
      });
    },
    onSuccess: () => {
      toast.success('Biznes maʼlumoti saqlandi');
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Biznes va narxlar"
        description="AI agent shu ma'lumot asosida gaplashadi va tavsiya beradi"
      />
      <div className="space-y-4 px-5 py-4">
        <Field
          label="Biznes haqida"
          hint="Xizmatlar, auditoriya, ovoz, taqiqlangan mavzular — batafsil yozing"
        >
          <Textarea
            rows={10}
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
            placeholder="Kompaniya nima qiladi, qanday mahsulotlar, qanday gapirish kerak..."
          />
        </Field>
        <Field label="Price list" hint="Har qator: Nomi | Narx | Birlik | Izoh">
          <Textarea
            rows={8}
            value={priceText}
            onChange={(event) => setPriceText(event.target.value)}
            placeholder={'Premium tarif | 99000 | oy | cheklovsiz\nSetup | 500000 | bir martalik'}
            className="font-mono text-sm"
          />
        </Field>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="size-4" /> Saqlash
        </Button>
      </div>
    </Card>
  );
}

function PhoneTab({ showManage }: { showManage: boolean }) {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-4">
      <CompanionSetupGuide />

      <Card className="p-5">
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-[var(--color-brand)]/12 text-[var(--color-brand)]">
            <Smartphone className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Brauzer softfoni</p>
            {user?.sipExtension ? (
              <p className="mt-1 text-sm">
                SIP raqamingiz:{' '}
                <span className="font-mono font-semibold">{user.sipExtension}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-warning)]">
                SIP raqami berilmagan — softfon uchun administratordan so&apos;rang
              </p>
            )}
          </div>
        </div>
      </Card>

      {showManage ? <DevicesTab /> : null}
    </div>
  );
}

function ProfileTab() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return (
    <Card className="space-y-3 p-5">
      <Field label="Ism">
        <Input value={user.fullName} disabled />
      </Field>
      <Field label="Email">
        <Input value={user.email} disabled />
      </Field>
      <Field label="SIP">
        <Input value={user.sipExtension ?? '—'} disabled />
      </Field>
      <p className="text-xs text-[var(--color-text-muted)]">
        O&apos;zgarishlar uchun administratorga murojaat qiling
      </p>
    </Card>
  );
}
