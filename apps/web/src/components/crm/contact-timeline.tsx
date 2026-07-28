'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  GitBranch,
  MessageSquare,
  Send,
  StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { formatDuration, formatDateTime, timeAgo } from '@/lib/utils';
import type { TimelineEntry, TimelineKind } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Spinner, Textarea } from '@/components/ui';
import { RecordingPlayer } from '@/components/recording-player';

const ICONS: Record<TimelineKind, typeof StickyNote> = {
  CALL: ArrowDownLeft,
  SMS: MessageSquare,
  NOTE: StickyNote,
  TASK: GitBranch,
  DEAL_STAGE_CHANGED: GitBranch,
  SYSTEM: GitBranch,
};

/** Qo'ng'iroq, SMS va izohlar bitta xronologik lentada — TZ 5.3 talabi. */
export function ContactTimeline({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const timeline = useQuery({
    queryKey: ['contacts', contactId, 'timeline'],
    queryFn: () =>
      api.get<TimelineEntry[]>(`/contacts/${contactId}/timeline`, { query: { limit: 50 } }),
  });

  const addNote = useMutation({
    mutationFn: (body: string) => api.post(`/contacts/${contactId}/notes`, { body }),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['contacts', contactId, 'timeline'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader title="Muomala tarixi" description="Qo'ng'iroq, SMS va izohlar" />

      <div className="flex gap-2 border-b border-[var(--color-border-subtle)] px-5 py-3">
        <Textarea
          rows={2}
          placeholder="Izoh qoldirish..."
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl+Enter — operator sichqonchaga qo'l urmasdan yozib ketadi.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && note.trim()) {
              addNote.mutate(note.trim());
            }
          }}
        />
        <Button
          size="icon"
          disabled={!note.trim() || addNote.isPending}
          onClick={() => addNote.mutate(note.trim())}
          title="Ctrl+Enter"
        >
          {addNote.isPending ? <Spinner /> : <Send className="size-4" />}
        </Button>
      </div>

      {timeline.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-[var(--color-brand)]" />
        </div>
      ) : (timeline.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Tarix bo'sh"
          hint="Birinchi qo'ng'iroq yoki izohdan keyin bu yerda ko'rinadi"
        />
      ) : (
        <ol className="divide-y divide-[var(--color-border-subtle)]">
          {timeline.data?.map((entry) => {
            const outbound = entry.metadata.direction === 'OUTBOUND';
            const Icon = entry.kind === 'CALL' && outbound ? ArrowUpRight : ICONS[entry.kind];

            return (
              <li key={entry.id} className="flex gap-3 px-5 py-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                  <Icon className="size-3.5 text-[var(--color-text-muted)]" />
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{entry.title}</span>

                    {entry.kind === 'CALL' && entry.metadata.disposition ? (
                      <Badge
                        tone={entry.metadata.disposition === 'ANSWERED' ? 'positive' : 'warning'}
                      >
                        {entry.metadata.disposition}
                      </Badge>
                    ) : null}

                    {entry.kind === 'CALL' && entry.metadata.talkTimeSec ? (
                      <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
                        {formatDuration(entry.metadata.talkTimeSec)}
                      </span>
                    ) : null}

                    {entry.metadata.status && entry.kind === 'SMS' ? (
                      <Badge tone={entry.metadata.status === 'DELIVERED' ? 'positive' : 'neutral'}>
                        {entry.metadata.status}
                      </Badge>
                    ) : null}

                    <span
                      className="ml-auto text-xs text-[var(--color-text-muted)]"
                      title={formatDateTime(entry.occurredAt)}
                    >
                      {timeAgo(entry.occurredAt)}
                    </span>
                  </div>

                  {entry.body ? (
                    <p className="whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                      {entry.body}
                    </p>
                  ) : null}

                  {entry.metadata.operator ? (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Operator: {entry.metadata.operator.fullName}
                    </p>
                  ) : null}

                  {entry.metadata.recording && entry.metadata.callId ? (
                    <RecordingPlayer
                      callId={entry.metadata.callId}
                      recording={entry.metadata.recording}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
