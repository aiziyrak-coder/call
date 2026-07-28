'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Queue } from '@/lib/types';
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
} from '@/components/ui';

const STRATEGY_LABEL: Record<Queue['strategy'], string> = {
  round_robin: 'Navbat bilan',
  least_recent: "Eng uzoq bo'sh turgan",
  fewest_calls: "Eng kam qo'ng'iroq olgan",
  skill_based: "Ko'nikmaga asoslangan",
};

export function QueuesTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const queues = useQuery({
    queryKey: ['admin', 'queues'],
    queryFn: () => api.get<Queue[]>('/admin/queues'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/queues/${id}`),
    onSuccess: () => {
      toast.success("Navbat o'chirildi");
      void queryClient.invalidateQueries({ queryKey: ['admin', 'queues'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: (queue: Queue) =>
      api.patch(`/admin/queues/${queue.id}`, { isActive: !queue.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'queues'] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Navbatlar"
        description="ACD strategiyasi va SLA sozlamalari"
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Navbat
          </Button>
        }
      />

      {queues.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-[var(--color-brand)]" />
        </div>
      ) : (queues.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Navbat yo'q"
          hint="Kiruvchi qo'ng'iroqlarni taqsimlash uchun navbat yarating"
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {queues.data?.map((queue) => (
            <li key={queue.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{queue.name}</p>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">
                  {queue.extension} · {STRATEGY_LABEL[queue.strategy]}
                </p>
              </div>

              <span className="text-xs text-[var(--color-text-muted)]">
                SLA {queue.slaSeconds}s · maks. kutish {queue.maxWaitSeconds}s
              </span>

              <Badge tone={queue.isActive ? 'positive' : 'neutral'}>
                {queue.isActive ? 'Faol' : "O'chirilgan"}
              </Badge>

              <Button size="sm" variant="ghost" onClick={() => toggle.mutate(queue)}>
                {queue.isActive ? "O'chirish" : 'Yoqish'}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                aria-label="Navbatni o'chirish"
                onClick={() => {
                  if (window.confirm(`"${queue.name}" navbati o'chiriladi. Davom etamizmi?`)) {
                    remove.mutate(queue.id);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <QueueDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'queues'] });
          }}
        />
      ) : null}
    </Card>
  );
}

function QueueDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [extension, setExtension] = useState('');
  const [strategy, setStrategy] = useState<Queue['strategy']>('round_robin');
  const [slaSeconds, setSlaSeconds] = useState(20);
  const [maxWaitSeconds, setMaxWaitSeconds] = useState(300);

  const save = useMutation({
    mutationFn: () =>
      api.post('/admin/queues', {
        name: name.trim(),
        extension: extension.trim(),
        strategy,
        slaSeconds,
        maxWaitSeconds,
        announcePosition: true,
        isActive: true,
      }),
    onSuccess: () => {
      toast.success('Navbat yaratildi');
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      title="Yangi navbat"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || !/^\d{3,6}$/.test(extension) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Spinner /> : null} Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nomi">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>

        <Field label="Ichki raqam" hint="3-6 xonali raqam, masalan 8001">
          <Input
            inputMode="numeric"
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
          />
        </Field>

        <Field label="Taqsimlash strategiyasi">
          <Select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as Queue['strategy'])}
          >
            {Object.entries(STRATEGY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SLA (soniya)">
            <Input
              type="number"
              value={slaSeconds}
              onChange={(event) => setSlaSeconds(Number(event.target.value))}
            />
          </Field>
          <Field label="Maks. kutish (soniya)">
            <Input
              type="number"
              value={maxWaitSeconds}
              onChange={(event) => setMaxWaitSeconds(Number(event.target.value))}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
