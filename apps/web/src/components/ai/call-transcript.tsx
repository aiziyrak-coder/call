'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui';

interface Transcript {
  language: string;
  engine: string;
  summary: string | null;
  segments: Array<{
    id: string;
    speaker: 'OPERATOR' | 'CUSTOMER' | 'UNKNOWN';
    text: string;
    startMs: number;
  }>;
}

/** Tugagan suhbat matni — CRM kartochkasi va qo'ng'iroqlar tarixida. */
export function CallTranscript({ callId }: { callId: string }) {
  const query = useQuery({
    queryKey: ['transcript', callId],
    queryFn: () => api.get<Transcript>(`/transcripts/${callId}`),
    // Transkripsiya bo'lmasligi normal holat — 404 da qayta urinilmaydi.
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (query.isLoading) return <Spinner className="text-[var(--color-brand)]" />;
  if (!query.data) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <FileText className="size-3.5" />
        Transkripsiya · {query.data.engine} · {query.data.language}
      </p>

      {query.data.summary ? (
        <p className="rounded-lg bg-[var(--color-brand)]/8 px-3 py-2 text-xs">
          {query.data.summary}
        </p>
      ) : null}

      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {query.data.segments.map((segment) => (
          <p key={segment.id} className="text-xs">
            <span
              className={cn(
                'mr-1.5 font-medium',
                segment.speaker === 'OPERATOR'
                  ? 'text-[var(--color-brand)]'
                  : 'text-[var(--color-positive)]',
              )}
            >
              {segment.speaker === 'OPERATOR' ? 'Operator:' : 'Mijoz:'}
            </span>
            {segment.text}
          </p>
        ))}
      </div>
    </div>
  );
}
