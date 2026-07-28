'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Button, Textarea } from '@/components/ui';

export function CallNotesEditor({
  callId,
  initialNotes,
}: {
  callId: string;
  initialNotes: string | null;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(initialNotes ?? '');

  const save = useMutation({
    mutationFn: () => api.post(`/calls/${callId}/notes`, { notes }),
    onSuccess: () => {
      toast.success('Izoh saqlandi');
      void queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--color-text-muted)]">Qo&apos;ng&apos;iroq izohi</p>
      <Textarea
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Suhbat haqida qisqa yozuv..."
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={save.isPending || notes === (initialNotes ?? '')}
        onClick={() => save.mutate()}
      >
        Saqlash
      </Button>
    </div>
  );
}
