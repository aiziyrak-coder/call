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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-brand)] text-white shadow-[0_4px_16px_color-mix(in_oklch,var(--color-brand)_35%,transparent)] hover:bg-[var(--color-brand-strong)] hover:shadow-[0_6px_20px_color-mix(in_oklch,var(--color-brand)_40%,transparent)]',
  secondary:
    'glass text-[var(--color-text-primary)] hover:bg-white/50 dark:hover:bg-white/10',
  ghost:
    'text-[var(--color-text-muted)] hover:bg-black/[0.04] dark:hover:bg-white/[0.08]',
  danger:
    'bg-[var(--color-negative)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-negative)_30%,transparent)] hover:opacity-95',
  success:
    'bg-[var(--color-positive)] text-white shadow-[0_4px_14px_color-mix(in_oklch,var(--color-positive)_30%,transparent)] hover:opacity-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-10 h-10 px-3.5 text-[13px] sm:min-h-8 sm:h-8',
  md: 'min-h-11 h-11 px-5 text-[15px] sm:min-h-10 sm:h-10',
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
        'pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold tracking-[-0.01em]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

const fieldChrome =
  'w-full rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] ' +
  'bg-white/45 dark:bg-white/[0.06] backdrop-blur-xl ' +
  'px-3.5 text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] ' +
  'transition-[border-color,box-shadow] duration-200 ' +
  'focus:border-[var(--color-brand)] focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-brand)_22%,transparent)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('h-11', fieldChrome, className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn('h-11', fieldChrome, className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'glass animate-fade-up rounded-[var(--radius-panel)] overflow-hidden',
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
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'positive' | 'warning' | 'negative';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-black/[0.05] text-[var(--color-text-muted)] dark:bg-white/10',
  brand: 'bg-[var(--color-brand)]/12 text-[var(--color-brand)]',
  positive: 'bg-[var(--color-positive)]/14 text-[var(--color-positive)]',
  warning: 'bg-[var(--color-warning)]/16 text-[oklch(45%_0.12_75)] dark:text-[var(--color-warning)]',
  negative: 'bg-[var(--color-negative)]/14 text-[var(--color-negative)]',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
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
    <div className="animate-fade-up flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="mb-1 flex size-14 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
        <span className="text-xl opacity-80" aria-hidden>
          ◇
        </span>
      </div>
      <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
        {title}
      </p>
      {hint ? <p className="max-w-sm text-[13px] leading-relaxed text-[var(--color-text-muted)]">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('min-h-24 py-2.5', fieldChrome, className)} {...props} />;
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
    <label className="block space-y-1.5">
      <span className="pl-0.5 text-[12px] font-semibold tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block pl-0.5 text-[11px] leading-snug text-[var(--color-text-muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-6"
      style={{ background: 'oklch(20% 0.02 250 / 0.35)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'glass-strong animate-sheet-up mt-16 w-full overflow-hidden rounded-[1.5rem]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="pressable flex size-9 items-center justify-center rounded-full bg-black/[0.04] text-[var(--color-text-muted)] hover:bg-black/[0.08] dark:bg-white/10"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3.5">
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
    <div
      role="tablist"
      className="glass inline-flex gap-0.5 rounded-[var(--radius-control)] p-1"
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            'pressable relative rounded-[calc(var(--radius-control)-2px)] px-3.5 py-2 text-[13px] font-semibold transition-all duration-200',
            item.value === value
              ? 'bg-white/80 text-[var(--color-text-primary)] shadow-sm dark:bg-white/15'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {item.label}
          {item.count === undefined ? null : (
            <span className="ml-1.5 text-[11px] tabular-nums opacity-70">{item.count}</span>
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
