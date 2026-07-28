'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Download, Smartphone } from 'lucide-react';
import { Button, Card } from '@/components/ui';

/**
 * Companion APK yuklab olish — telefon kamerasi bilan QR skanerlash.
 * Fayl: apps/web/public/companion.apk (Play Marketda emas).
 */
export function CompanionDownloadCard({ className }: { className?: string }) {
  const apkUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/companion.apk`
      : 'https://call.devflix.uz/companion.apk';

  return (
    <Card className={className ?? 'p-5'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 rounded-[1rem] border border-[var(--color-border-subtle)] bg-white p-3 dark:bg-white">
          <QRCodeSVG
            value={apkUrl}
            size={168}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#0c1220"
            aria-label="Companion APK yuklab olish QR kodi"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-[var(--color-brand)]" strokeWidth={2.25} />
            <p className="font-semibold">Companion APK</p>
          </div>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Play Marketda yo&apos;q — QR kodni telefon kamerasi bilan skanerlang yoki tugmani
            bosing. Yuklab olingach &quot;noma&apos;lum manba&quot;dan o&apos;rnatishga ruxsat bering.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-[var(--color-text-muted)]">
            <li>QR skaner → APK yuklab olish</li>
            <li>O&apos;rnatish → ilovani ochish</li>
            <li>
              Server:{' '}
              <span className="font-mono text-[var(--color-text-primary)]">
                https://call.devflix.uz
              </span>
            </li>
            <li>Ro&apos;yxatdan o&apos;tish siri — administratordan</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/companion.apk" download="aicc-companion.apk">
              <Button type="button" className="rounded-full">
                <Download className="size-4" strokeWidth={2.25} /> APK yuklab olish
              </Button>
            </a>
            <p className="w-full break-all font-mono text-[11px] text-[var(--color-text-muted)]">
              {apkUrl}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
