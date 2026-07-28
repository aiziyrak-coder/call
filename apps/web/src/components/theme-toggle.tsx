'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: "Yorug'", icon: Sun },
  { value: 'system', label: 'Tizim', icon: Monitor },
  { value: 'dark', label: "Qorong'i", icon: Moon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Server va klient HTML mos kelishi uchun mount bo'lgunga qadar hech narsa
  // ko'rsatilmaydi (mavzu faqat brauzerda ma'lum).
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-24" />;

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border-subtle)] p-0.5"
      role="group"
      aria-label="Mavzu"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          title={label}
          aria-pressed={theme === value}
          className={cn(
            'flex size-11 items-center justify-center rounded-md transition-colors sm:size-7',
            theme === value
              ? 'bg-[var(--color-brand)]/12 text-[var(--color-brand)]'
              : 'text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
