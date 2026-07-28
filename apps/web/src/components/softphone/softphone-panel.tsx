'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Delete,
  Grid3x3,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Play,
  Shuffle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { cn, formatDuration, formatPhone } from '@/lib/utils';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { useSoftphone } from './softphone-provider';
import { useAuthStore } from '@/lib/stores';
import type { Colleague } from '@/lib/types';

const DIALPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

const STATE_LABELS: Record<
  string,
  { text: string; tone: 'neutral' | 'positive' | 'warning' | 'negative' | 'brand' }
> = {
  disconnected: { text: 'Ulanmagan', tone: 'neutral' },
  connecting: { text: 'Ulanmoqda', tone: 'warning' },
  registered: { text: 'Tayyor', tone: 'positive' },
  ringing: { text: "Kiruvchi qo'ng'iroq", tone: 'brand' },
  calling: { text: 'Chaqirilmoqda', tone: 'brand' },
  active: { text: 'Suhbat', tone: 'positive' },
  held: { text: 'Kutishda', tone: 'warning' },
  failed: { text: 'Xato', tone: 'negative' },
};

export function SoftphonePanel() {
  const phone = useSoftphone();
  const user = useAuthStore((state) => state.user);
  const [dialValue, setDialValue] = useState('');
  const [showDialpad, setShowDialpad] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const dialInputRef = useRef<HTMLInputElement>(null);

  const call = phone.call;
  const inCall = phone.state === 'active' || phone.state === 'held';

  // Suhbat davomiyligi sekundlik hisoblagichi.
  useEffect(() => {
    if (!call?.answeredAt) {
      setElapsed(0);
      return;
    }
    const answeredAt = call.answeredAt.getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - answeredAt) / 1000));
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [call?.answeredAt]);

  useEffect(() => {
    if (!showTransfer || colleagues.length > 0) return;
    api
      .get<Colleague[]>('/users/colleagues')
      .then(setColleagues)
      .catch(() => toast.error("Hamkasblar ro'yxatini olib bo'lmadi"));
  }, [showTransfer, colleagues.length]);

  /**
   * Tezkor tugmalar. Matn maydonida yozayotgan operatorga xalaqit bermasligi
   * uchun input/textarea fokusda bo'lganda o'tkazib yuboriladi.
   */
  useEffect(() => {
    if (!user?.sipExtension) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      // F-tugmalari matn kiritishga xalaqit bermaydi, shuning uchun ular doim ishlaydi.
      if (event.key === 'F9') {
        event.preventDefault();
        if (phone.state === 'ringing') void phone.answer();
        else if (dialValue && phone.ready) void phone.dial(dialValue);
        else if (dialValue && !phone.ready) toast.error('Softfon ulanmagan');
        return;
      }
      if (event.key === 'F10') {
        event.preventDefault();
        void phone.hangup();
        return;
      }
      if (typing) return;

      if (event.key === 'F8') {
        event.preventDefault();
        void phone.toggleHold();
      }
      if (event.key === 'm' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        phone.toggleMute();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phone, dialValue, user?.sipExtension]);

  const statusBadge = useMemo(
    () => STATE_LABELS[phone.state] ?? STATE_LABELS.disconnected!,
    [phone.state],
  );

  if (!user?.sipExtension) {
    return (
      <Card className="flex w-full flex-col overflow-hidden p-4">
        <p className="text-sm font-semibold">Softfon</p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          SIP raqami biriktirilmagan. Softfon uchun administrator sozlamalaridan raqam bering.
        </p>
      </Card>
    );
  }

  const pressDigit = (digit: string) => {
    if (inCall) {
      phone.sendDtmf(digit);
      return;
    }
    setDialValue((value) => `${value}${digit}`);
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    const ok = await phone.transfer(transferTarget);
    if (!ok) return;
    setShowTransfer(false);
    setTransferTarget('');
    toast.success('Transfer yuborildi');
  };

  return (
    <Card className="flex w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-full',
              phone.ready
                ? 'bg-[var(--color-positive)]/15 text-[var(--color-positive)]'
                : 'bg-black/5 text-[var(--color-text-muted)] dark:bg-white/10',
            )}
          >
            {phone.ready ? (
              <Wifi className="size-3.5" strokeWidth={2.25} />
            ) : (
              <WifiOff className="size-3.5" strokeWidth={2.25} />
            )}
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Softfon</span>
        </div>
        <Badge tone={statusBadge.tone} className="rounded-full">
          {statusBadge.text}
        </Badge>
      </div>

      {/* Faol yoki kiruvchi qo'ng'iroq kartochkasi */}
      {call ? (
        <div
          className={cn(
            'flex flex-col items-center gap-1 px-4 py-5',
            phone.state === 'ringing' && 'bg-[var(--color-brand)]/8',
          )}
        >
          {phone.state === 'ringing' ? (
            <div className="mb-2 flex size-12 animate-ring items-center justify-center rounded-full bg-[var(--color-positive)]/15">
              <PhoneIncoming className="size-5 text-[var(--color-positive)]" />
            </div>
          ) : null}
          <p className="text-lg font-semibold">{formatPhone(call.remoteNumber)}</p>
          {call.remoteName ? (
            <p className="text-sm text-[var(--color-text-muted)]">{call.remoteName}</p>
          ) : null}
          <p className="font-mono text-sm text-[var(--color-text-muted)]">
            {call.answeredAt ? formatDuration(elapsed) : 'chaqirilmoqda...'}
          </p>
          {call.held ? <Badge tone="warning">Kutish rejimida</Badge> : null}
        </div>
      ) : (
        <div className="px-4 pt-4">
          <div className="flex gap-2">
            <Input
              ref={dialInputRef}
              value={dialValue}
              onChange={(event) => setDialValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && dialValue) void phone.dial(dialValue);
              }}
              placeholder="+998 90 123 45 67"
              inputMode="tel"
              className="font-mono"
              aria-label="Terilayotgan raqam"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDialValue((value) => value.slice(0, -1))}
              disabled={!dialValue}
              aria-label="O'chirish"
            >
              <Delete className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Boshqaruv tugmalari */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 px-4 py-4">
        {phone.state === 'ringing' ? (
          <>
            <Button variant="success" onClick={() => void phone.answer()} className="flex-1 rounded-full">
              <Phone className="size-4" strokeWidth={2.25} /> Qabul qilish
            </Button>
            <Button variant="danger" onClick={() => void phone.hangup()} className="flex-1 rounded-full">
              <PhoneOff className="size-4" strokeWidth={2.25} /> Rad etish
            </Button>
          </>
        ) : inCall || phone.state === 'calling' ? (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => phone.toggleMute()}
              title="Mikrofon (Ctrl+M)"
              aria-pressed={call?.muted ?? false}
            >
              {call?.muted ? (
                <MicOff className="size-4 text-[var(--color-negative)]" strokeWidth={2.25} />
              ) : (
                <Mic className="size-4" strokeWidth={2.25} />
              )}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => void phone.toggleHold()}
              disabled={!inCall}
              title="Kutish (F8)"
              aria-pressed={call?.held ?? false}
            >
              {call?.held ? (
                <Play className="size-4" strokeWidth={2.25} />
              ) : (
                <Pause className="size-4" strokeWidth={2.25} />
              )}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => setShowDialpad((value) => !value)}
              title="DTMF klaviaturasi"
            >
              <Grid3x3 className="size-4" strokeWidth={2.25} />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => setShowTransfer((value) => !value)}
              disabled={!inCall}
              title="Transfer"
            >
              <Shuffle className="size-4" strokeWidth={2.25} />
            </Button>
            <Button variant="danger" className="rounded-full" onClick={() => void phone.hangup()}>
              <PhoneOff className="size-4" strokeWidth={2.25} /> Tugatish
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => setShowDialpad((value) => !value)}
              title="Raqam terish"
            >
              <Grid3x3 className="size-4" strokeWidth={2.25} />
            </Button>
            <Button
              variant="success"
              onClick={() => void phone.dial(dialValue)}
              disabled={!dialValue || !phone.ready}
              className="flex-1 rounded-full"
            >
              <Phone className="size-4" strokeWidth={2.25} /> Qo&apos;ng&apos;iroq qilish
            </Button>
          </>
        )}
      </div>

      {showTransfer ? (
        <div className="space-y-2 border-t border-[var(--color-border-subtle)] px-4 py-3">
          <Select
            value={transferTarget}
            onChange={(event) => setTransferTarget(event.target.value)}
            aria-label="Transfer manzili"
          >
            <option value="">Hamkasbni tanlang...</option>
            {colleagues
              .filter((colleague) => colleague.sipExtension)
              .map((colleague) => (
                <option key={colleague.id} value={colleague.sipExtension!}>
                  {colleague.fullName} ({colleague.sipExtension}) —{' '}
                  {colleague.status === 'AVAILABLE' ? "bo'sh" : 'band'}
                </option>
              ))}
          </Select>
          <div className="flex gap-2">
            <Input
              value={transferTarget}
              onChange={(event) => setTransferTarget(event.target.value)}
              placeholder="yoki raqam kiriting"
              className="font-mono"
            />
            <Button onClick={() => void handleTransfer()} disabled={!transferTarget}>
              Uzatish
            </Button>
          </div>
        </div>
      ) : null}

      {showDialpad ? (
        <div className="grid grid-cols-3 gap-2.5 px-5 py-4">
          {DIALPAD_KEYS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => pressDigit(digit)}
              className={cn(
                'pressable flex h-14 items-center justify-center rounded-full',
                'bg-black/[0.05] text-[22px] font-semibold tracking-tight dark:bg-white/[0.08]',
                'hover:bg-black/[0.08] dark:hover:bg-white/[0.12]',
                'active:bg-[var(--color-brand)]/15',
              )}
            >
              {digit}
            </button>
          ))}
        </div>
      ) : null}

      {phone.state === 'disconnected' || phone.state === 'failed' ? (
        <div className="border-t border-[var(--color-border-subtle)] px-4 py-3">
          <Button variant="secondary" className="w-full" onClick={() => void phone.reconnect()}>
            Qayta ulanish
          </Button>
          <p className="mt-2 text-[11px] leading-snug text-[var(--color-text-muted)]">
            Dev muhitida avval{' '}
            <a
              href="https://localhost:8089"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-brand)] underline"
            >
              https://localhost:8089
            </a>{' '}
            manzilini ochib, Asterisk sertifikatini qabul qiling.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
