'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BatteryLow, RefreshCw, Signal, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { formatPhone, timeAgo } from '@/lib/utils';
import type { CompanionDevice } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';

export function DevicesTab() {
  const me = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const canManage = me ? hasPermission(me.roles, 'device:manage') : false;

  const devices = useQuery({
    queryKey: ['admin', 'devices'],
    queryFn: () => api.get<CompanionDevice[]>('/devices'),
    // Heartbeat 30 soniyada bir keladi, shuning uchun shu oraliqda yangilaymiz.
    refetchInterval: 30_000,
  });

  const restart = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/restart`),
    onSuccess: () => toast.success("Qayta ishga tushirish buyrug'i navbatga qo'yildi"),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/devices/${id}`),
    onSuccess: () => {
      toast.success("Qurilma o'chirildi");
      void queryClient.invalidateQueries({ queryKey: ['admin', 'devices'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Qurilmalar"
        description="Companion ilovasi o'rnatilgan Android telefonlar"
      />

      {devices.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-[var(--color-brand)]" />
        </div>
      ) : (devices.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Qurilma yo'q"
          hint="Companion ilovasini o'rnating va ro'yxatdan o'tkazing"
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {devices.data?.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Smartphone
                className={
                  device.online
                    ? 'size-5 text-[var(--color-positive)]'
                    : 'size-5 text-[var(--color-text-muted)]'
                }
              />

              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{device.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {device.phoneNumbers.length > 0
                    ? device.phoneNumbers.map(formatPhone).join(', ')
                    : 'raqam aniqlanmagan'}
                  {device.operator ? ` · ${device.operator.fullName}` : ' · biriktirilmagan'}
                </p>
              </div>

              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <BatteryLow
                  className={
                    (device.batteryLevel ?? 100) < 20
                      ? 'size-3.5 text-[var(--color-negative)]'
                      : 'size-3.5'
                  }
                />
                {device.batteryLevel ?? '—'}%
              </span>

              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Signal className="size-3.5" />
                {device.signalStrength ?? '—'} dBm
              </span>

              <span className="text-xs text-[var(--color-text-muted)]">
                {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'hech qachon'}
              </span>

              <Badge tone={device.online ? 'positive' : 'neutral'}>
                {device.online ? 'Onlayn' : 'Oflayn'}
              </Badge>

              {canManage ? (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Qayta ishga tushirish"
                    onClick={() => restart.mutate(device.id)}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Qurilmani o'chirish"
                    onClick={() => {
                      if (
                        window.confirm(`"${device.name}" ro'yxatdan o'chiriladi. Davom etamizmi?`)
                      ) {
                        remove.mutate(device.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
