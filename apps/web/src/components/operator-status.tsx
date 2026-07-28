'use client';

import { useState } from 'react';
import { Coffee, CheckCircle2, PhoneCall, PowerOff, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { Badge, Button, Select } from '@/components/ui';
import type { OperatorStatus as Status } from '@/lib/types';

const STATUS_META: Record<
  Status,
  { label: string; tone: 'neutral' | 'positive' | 'brand' | 'warning'; icon: typeof Coffee }
> = {
  OFFLINE: { label: 'Oflayn', tone: 'neutral', icon: PowerOff },
  AVAILABLE: { label: "Bo'sh", tone: 'positive', icon: CheckCircle2 },
  ON_CALL: { label: 'Suhbatda', tone: 'brand', icon: PhoneCall },
  AFTER_CALL_WORK: { label: "Qo'ng'iroqdan keyin", tone: 'warning', icon: ClipboardList },
  BREAK: { label: 'Tanaffus', tone: 'warning', icon: Coffee },
};

const BREAK_REASONS = ['Tushlik', 'Qisqa tanaffus', 'Uchrashuv', "O'quv", 'Texnik muammo'];

export function OperatorStatusControl() {
  const user = useAuthStore((state) => state.user);
  const setStatus = useAuthStore((state) => state.setStatus);
  const [pending, setPending] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  if (!user) return null;

  const meta = STATUS_META[user.status];
  const Icon = meta.icon;

  const change = async (status: Status, reason?: string) => {
    setPending(true);
    try {
      await api.post('/users/me/status', { status, reason });
      setStatus(status, reason);
      setShowReasons(false);
      toast.success(`Holat: ${STATUS_META[status].label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Holatni o'zgartirib bo'lmadi");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge tone={meta.tone} className="gap-1.5">
        <Icon className="size-3.5" />
        {meta.label}
        {user.statusReason ? ` — ${user.statusReason}` : ''}
      </Badge>

      {user.status === 'BREAK' || user.status === 'OFFLINE' ? (
        <Button
          size="sm"
          variant="success"
          disabled={pending}
          onClick={() => void change('AVAILABLE')}
        >
          Ishni boshlash
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => setShowReasons((value) => !value)}
          >
            <Coffee className="size-3.5" /> Tanaffus
          </Button>
          {showReasons ? (
            <Select
              className="h-8 w-40 text-xs"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) void change('BREAK', event.target.value);
              }}
              aria-label="Tanaffus sababi"
            >
              <option value="">Sababni tanlang...</option>
              {BREAK_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </Select>
          ) : null}
        </>
      )}
    </div>
  );
}
