'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { onAiccEvent } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui';
import { useSoftphone } from '@/components/softphone/softphone-provider';

interface Line {
  id: string;
  speaker: 'OPERATOR' | 'CUSTOMER' | 'UNKNOWN';
  text: string;
  startMs: number;
  isFinal: boolean;
}

interface SentimentState {
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry' | 'uncertain';
  score: number;
  label: string;
}

interface RecommendationState {
  title: string;
  detail: string;
  suggestedReply?: string;
}

const SPEAKER_LABEL: Record<Line['speaker'], string> = {
  OPERATOR: 'Operator',
  CUSTOMER: 'Mijoz',
  UNKNOWN: "Noma'lum",
};

const SENTIMENT_TONE: Record<SentimentState['sentiment'], 'positive' | 'warning' | 'negative' | 'neutral'> = {
  positive: 'positive',
  neutral: 'neutral',
  uncertain: 'neutral',
  negative: 'warning',
  angry: 'negative',
};

/**
 * Jonli transkripsiya + OpenAI sentiment / tavsiya (TZ 5.4).
 */
export function LiveTranscript({ callId }: { callId: string | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState<Line | null>(null);
  const [sentiment, setSentiment] = useState<SentimentState | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationState | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setPartial(null);
    setSentiment(null);
    setRecommendation(null);
    setSummary(null);
  }, [callId]);

  useEffect(() => {
    if (!callId) return;

    return onAiccEvent((event) => {
      if (event.type === 'transcript.partial' && event.callId === callId) {
        setPartial({
          id: `partial-${event.speaker}`,
          speaker: event.speaker,
          text: event.text,
          startMs: event.startMs,
          isFinal: false,
        });
      }

      if (event.type === 'transcript.final' && event.callId === callId) {
        setPartial(null);
        setLines((current) => [
          ...current,
          {
            id: event.eventId,
            speaker: event.speaker,
            text: event.text,
            startMs: event.startMs,
            isFinal: true,
          },
        ]);
      }

      if (event.type === 'ai.sentiment' && event.callId === callId) {
        setSentiment({
          sentiment: event.sentiment,
          score: event.score,
          label: event.label,
        });
      }

      if (event.type === 'ai.recommendation' && event.callId === callId) {
        setRecommendation({
          title: event.title,
          detail: event.detail,
          suggestedReply: event.suggestedReply,
        });
      }

      if (event.type === 'ai.summary' && event.callId === callId) {
        setSummary(event.summary);
      }
    });
  }, [callId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, partial]);

  const visible = useMemo(() => (partial ? [...lines, partial] : lines), [lines, partial]);

  return (
    <Card>
      <CardHeader
        title="Jonli transkripsiya"
        description={callId ? "OpenAI Whisper — real vaqtda nutq → matn" : 'Faol suhbat kutilmoqda'}
        action={
          <div className="flex items-center gap-1.5">
            {sentiment ? (
              <Badge tone={SENTIMENT_TONE[sentiment.sentiment]}>{sentiment.label}</Badge>
            ) : null}
            <Badge tone={callId ? 'positive' : 'neutral'}>
              <Sparkles className="size-3" /> OpenAI
            </Badge>
          </div>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          title={callId ? 'Nutq kutilmoqda...' : 'Suhbat boshlanmagan'}
          hint={callId ? undefined : "Qo'ng'iroq boshlanganda matn shu yerda paydo bo'ladi"}
        />
      ) : (
        <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto px-5 py-3">
          {visible.map((line) => (
            <div
              key={line.id}
              className={cn(
                'flex gap-2 text-sm',
                line.speaker === 'OPERATOR' ? 'flex-row-reverse text-right' : '',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                  line.speaker === 'OPERATOR'
                    ? 'bg-[var(--color-brand)]/12 text-[var(--color-brand)]'
                    : 'bg-[var(--color-positive)]/15 text-[var(--color-positive)]',
                )}
              >
                {line.speaker === 'OPERATOR' ? 'O' : 'M'}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {SPEAKER_LABEL[line.speaker]} · {formatOffset(line.startMs)}
                </p>
                <p className={cn(line.isFinal ? '' : 'italic text-[var(--color-text-muted)]')}>
                  {line.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {recommendation ? (
        <div className="space-y-1 border-t border-[var(--color-border-subtle)] px-5 py-3">
          <p className="text-xs font-medium text-[var(--color-brand)]">{recommendation.title}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{recommendation.detail}</p>
          {recommendation.suggestedReply ? (
            <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-sm italic dark:bg-white/[0.06]">
              “{recommendation.suggestedReply}”
            </p>
          ) : null}
        </div>
      ) : null}

      {summary ? (
        <div className="border-t border-[var(--color-border-subtle)] px-5 py-3">
          <p className="text-xs font-medium">Suhbat xulosasi</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{summary}</p>
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 border-t border-[var(--color-border-subtle)] px-5 py-2 text-[11px] text-[var(--color-text-muted)]">
        <Bot className="size-3.5" />
        Sentiment va tavsiyalar OpenAI GPT orqali yangilanadi
      </p>
    </Card>
  );
}

/** Softfon kontekstidagi joriy qo'ng'iroqqa avtomatik ulanadi. */
export function LiveTranscriptPanel() {
  const { serverCallId } = useSoftphone();
  if (!serverCallId) return null;
  return <LiveTranscript callId={serverCallId} />;
}

function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
