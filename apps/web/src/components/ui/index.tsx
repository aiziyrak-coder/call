'use client';

import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Kichik UI to'plami — tashqi komponent kutubxonasiga bog'lanmaslik uchun
// faqat kerakli primitivlar Tailwind ustida yozilgan.

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-strong)]',
  secondary:
    'bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand)]',
  ghost: 'text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5',
  danger: 'bg-[var(--color-negative)] text-white hover:opacity-90',
  success: 'bg-[var(--color-positive)] text-white hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 h-11 px-3 text-xs sm:min-h-8 sm:h-8',
  md: 'min-h-11 h-11 px-4 text-sm sm:min-h-10 sm:h-10',
  lg: 'min-h-12 h-12 px-6 text-base',
  icon: 'min-h-11 min-w-11 h-11 w-11',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]',
          'px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
          'focus:border-[var(--color-brand)] focus:outline-none',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]',
          'px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-raised)] shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'positive' | 'warning' | 'negative';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-black/5 text-[var(--color-text-muted)] dark:bg-white/10',
  brand: 'bg-[var(--color-brand)]/12 text-[var(--color-brand)]',
  positive: 'bg-[var(--color-positive)]/15 text-[var(--color-positive)]',
  warning: 'bg-[var(--color-warning)]/18 text-[var(--color-warning)]',
  negative: 'bg-[var(--color-negative)]/15 text-[var(--color-negative)]',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]',
        'px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
        'focus:border-[var(--color-brand)] focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[11px] text-[var(--color-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

/** Oddiy modal: Escape va fon bosilganda yopiladi, fokus ichida ushlanmaydi. */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'mt-12 w-full rounded-[var(--radius-panel)] border border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-raised)] shadow-xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-[var(--color-border-subtle)]">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            'relative -mb-px border-b-2 px-3 py-2 text-sm transition-colors',
            item.value === value
              ? 'border-[var(--color-brand)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {item.label}
          {item.count === undefined ? null : (
            <span className="ml-1.5 text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      role="status"
      aria-label="Yuklanmoqda"
    />
  );
}
