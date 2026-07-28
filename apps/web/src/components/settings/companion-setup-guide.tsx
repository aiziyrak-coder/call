'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { Button, Card, CardHeader, Spinner } from '@/components/ui';
import { CompanionDownloadCard } from '@/components/settings/companion-download-card';

interface SetupGuide {
  serverUrl: string;
  tenantSlug: string;
  tenantName: string;
  enrollmentSecret: string;
  steps: string[];
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Nusxa olindi');
    } catch {
      toast.error("Nusxa olib bo'lmadi");
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[0.9rem] border border-[var(--color-border-subtle)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{label}</p>
        <p className={`mt-0.5 break-all text-sm ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
      </div>
      <Button type="button" size="sm" variant="secondary" className="shrink-0 rounded-full" onClick={() => void copy()}>
        <Copy className="size-3.5" /> Nusxa
      </Button>
    </div>
  );
}

/**
 * Companion maydonlarini qanday to'ldirish — saytda ko'rinadigan yo'riqnoma.
 */
export function CompanionSetupGuide() {
  const user = useAuthStore((state) => state.user);
  const guide = useQuery({
    queryKey: ['devices', 'setup-guide'],
    queryFn: () => api.get<SetupGuide>('/devices/setup-guide'),
    enabled: Boolean(user),
  });

  return (
    <div className="space-y-4">
      <CompanionDownloadCard />

      <Card>
        <CardHeader
          title="Companion yo'riqnoma"
          description="Telefon ekranidagi maydonlarni shu qiymatlar bilan to'ldiring"
        />

        {guide.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : null}

        <div className="space-y-3 px-5 py-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
              <span>
                <strong>1.</strong> Yuqoridagi QR orqali APK o&apos;rnating (Play Market emas).
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
              <span>
                <strong>2. Server manzili</strong> — emulator manzili (
                <code className="font-mono text-xs">10.0.2.2</code>) emas, quyidagini yozing.
              </span>
            </li>
          </ol>

          <CopyRow
            label="Server manzili"
            value={guide.data?.serverUrl ?? 'https://call.devflix.uz'}
          />
          <CopyRow label="Tashkilot kodi (tenant)" value={guide.data?.tenantSlug ?? 'demo'} />
          {guide.data?.enrollmentSecret ? (
            <CopyRow label="Ro'yxatdan o'tish siri" value={guide.data.enrollmentSecret} />
          ) : (
            <p className="text-xs text-[var(--color-warning)]">
              Sir yuklanmadi — sahifani yangilang yoki qayta kiring.
            </p>
          )}

          <CopyRow
            label="Operator email (ixtiyoriy)"
            value={user?.email ?? ''}
            mono={false}
          />

          <ol className="space-y-3 pt-2 text-sm" start={3}>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
              <span>
                <strong>3. Qurilma nomi</strong> — o&apos;zgartirmasangiz ham bo&apos;ladi (telefon
                modeli).
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
              <span>
                <strong>4.</strong> Avval <em>Ruxsatlarni so&apos;rash</em>, keyin{' '}
                <em>Batareya cheklovini olib tashlash</em> ni bosing (Xiaomi/Redmi da majburiy).
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
              <span>
                <strong>5.</strong> <em>Ro&apos;yxatdan o&apos;tish</em> — holat{' '}
                <em>ro&apos;yxatdan o&apos;tilgan</em> bo&apos;lishi kerak. Sozlamalar → Telefon da
                qurilma onlayn ko&apos;rinadi.
              </span>
            </li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
