'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Gauge, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { fetchBlob } from '@/lib/api-client';
import { formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui';

const SPEEDS = [1, 1.25, 1.5, 2] as const;

interface RecordingPlayerProps {
  callId: string;
  recording: { id: string; durationSec: number; format: string };
}

/**
 * Yozuv cookie-auth orqali yuklanadi va blob URL ga aylantiriladi —
 * cross-origin <audio src> cookie/CORP muammolaridan qochish uchun.
 */
export function RecordingPlayer({ callId, recording }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, url]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [],
  );

  const ensureUrl = async (): Promise<string | null> => {
    if (url) return url;
    setLoading(true);
    try {
      const blob = await fetchBlob(`/recordings/${callId}/stream`);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const objectUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objectUrl;
      setUrl(objectUrl);
      return objectUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yozuvni ochib bo'lmadi");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      return;
    }
    const source = await ensureUrl();
    if (!source) return;
    if (audio.src !== source) audio.src = source;
    await audio.play().catch(() => toast.error("Ijro qilib bo'lmadi"));
  };

  const download = async () => {
    const source = await ensureUrl();
    if (!source) return;
    const link = document.createElement('a');
    link.href = source;
    link.download = `aicc-${callId}.${recording.format || 'wav'}`;
    link.click();
  };

  const total = recording.durationSec || audioRef.current?.duration || 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2">
      <Button size="icon" variant="secondary" onClick={() => void toggle()} disabled={loading}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>

      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(total))}
        value={Math.floor(position)}
        onChange={(event) => {
          const next = Number(event.target.value);
          setPosition(next);
          if (audioRef.current) audioRef.current.currentTime = next;
        }}
        className="h-1 flex-1 accent-[var(--color-brand)]"
        aria-label="Yozuv pozitsiyasi"
      />

      <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
        {formatDuration(position)} / {formatDuration(total)}
      </span>

      <button
        type="button"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
        title="Tezlik"
      >
        <Gauge className="size-3.5" />
        {speed}x
      </button>

      <Button size="icon" variant="ghost" onClick={() => void download()} title="Yuklab olish">
        <Download className="size-4" />
      </Button>

      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        hidden
      />
    </div>
  );
}
