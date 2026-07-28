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

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-[6.75rem]" />;

  return (
    <div
      className="glass flex items-center gap-0.5 rounded-full p-1"
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
            'pressable flex size-8 items-center justify-center rounded-full transition-all duration-200 sm:size-7',
            theme === value
              ? 'bg-white/90 text-[var(--color-brand)] shadow-sm dark:bg-white/20'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.25} />
        </button>
      ))}
    </div>
  );
}
