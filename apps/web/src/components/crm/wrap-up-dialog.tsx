'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuthStore, useCallStore } from '@/lib/stores';
import { Button, Dialog, Field, Select, Textarea } from '@/components/ui';

const OUTCOMES = [
  { value: 'SOLD', label: 'Sotuv / kelishuv' },
  { value: 'CALLBACK', label: "Qayta qo'ng'iroq" },
  { value: 'INFO', label: "Ma'lumot berildi" },
  { value: 'COMPLAINT', label: 'Shikoyat' },
  { value: 'NO_INTEREST', label: "Qiziqish yo'q" },
  { value: 'WRONG_NUMBER', label: "Noto'g'ri raqam" },
  { value: 'OTHER', label: 'Boshqa' },
] as const;

/**
 * Qo'ng'iroq tugagach operator AFTER_CALL_WORK da qoladi.
 * Natija + izoh — keyin AVAILABLE.
 */
export function WrapUpDialog({
  callId,
  onDone,
}: {
  callId: string;
  onDone: () => void;
}) {
  const setStatus = useAuthStore((state) => state.setStatus);
  const clearAfterWrapUp = useCallStore((state) => state.clearAfterWrapUp);
  const [outcome, setOutcome] = useState<string>('INFO');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      await api.post(`/calls/${callId}/wrap-up`, { outcome, notes });
      setStatus('AVAILABLE', null);
      clearAfterWrapUp();
      toast.success('Suhbat yakunlandi');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Yakunlashda xato');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      title="Suhbatni yakunlash"
      description="Natijani tanlang — keyin bo'sh holatga o'tasiz"
      onClose={() => undefined}
      dismissible={false}
      width="max-w-md"
      footer={
        <Button onClick={() => void submit()} disabled={pending || !outcome} className="rounded-full">
          Saqlash va davom etish
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Natija">
          <Select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            {OUTCOMES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Izoh" hint="Ixtiyoriy — keyingi operator uchun foydali">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Mijoz nima so'radi, nima kelishildi..."
            rows={4}
          />
        </Field>
      </div>
    </Dialog>
  );
}
