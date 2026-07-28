'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PhoneCall,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { hasPermission, type Permission } from '@aicc/shared';
import { api, tokenStore } from '@/lib/api-client';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/lib/stores';
import { cn, initials } from '@/lib/utils';
import { Button, Spinner } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { OperatorStatusControl } from '@/components/operator-status';

const SoftphoneProvider = dynamic(
  () => import('@/components/softphone/softphone-provider').then((m) => m.SoftphoneProvider),
  { ssr: false },
);
const SoftphonePanel = dynamic(
  () => import('@/components/softphone/softphone-panel').then((m) => m.SoftphonePanel),
  { ssr: false },
);
const LiveTranscriptPanel = dynamic(
  () => import('@/components/ai/live-transcript').then((m) => m.LiveTranscriptPanel),
  { ssr: false },
);
const ScreenPop = dynamic(
  () => import('@/components/crm/screen-pop').then((m) => m.ScreenPop),
  { ssr: false },
);

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
}> = [
  { href: '/', label: 'Ish stoli', icon: LayoutDashboard },
  { href: '/calls', label: "Qo'ng'iroqlar", icon: PhoneCall },
  { href: '/contacts', label: 'Mijozlar', icon: Users },
  { href: '/deals', label: 'Voronka', icon: BarChart3 },
  { href: '/tasks', label: 'Vazifalar', icon: ClipboardList },
  { href: '/sms', label: 'SMS', icon: MessageSquare, permission: 'sms:send' },
  { href: '/supervisor', label: 'Jonli devor', icon: Headphones, permission: 'call:listen' },
  { href: '/admin', label: 'Sozlamalar', icon: Settings, permission: 'user:read' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  useEffect(() => {
    if (loading || user) return;
    window.location.replace('/login');
  }, [loading, user]);

  useEffect(() => {
    setNavOpen(false);
    setPhoneOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-7 text-[var(--color-brand)]" />
      </div>
    );
  }

  const logout = async () => {
    await api.post('/auth/logout', {}, { anonymous: true }).catch(() => undefined);
    disconnectSocket();
    tokenStore.clear();
    useAuthStore.getState().setUser(null);
    window.location.replace('/login');
  };

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  const nav = (
    <>
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-[var(--color-brand)] text-white shadow-[0_6px_16px_color-mix(in_oklch,var(--color-brand)_35%,transparent)]">
          <Headphones className="size-[18px]" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[17px] font-semibold tracking-[-0.03em]">AiCC</p>
          <p className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
            {user.tenant.name}
          </p>
        </div>
        <button
          type="button"
          className="pressable ml-auto flex size-10 items-center justify-center rounded-full bg-black/[0.04] lg:hidden dark:bg-white/10"
          onClick={() => setNavOpen(false)}
          aria-label="Menyuni yopish"
        >
          <X className="size-5" strokeWidth={2.25} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Asosiy menyu">
        {visibleNav.map(({ href, label, icon: Icon }, index) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{ animationDelay: `${index * 30}ms` }}
              className={cn(
                'animate-nav-in pressable flex min-h-11 items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200',
                active
                  ? 'bg-[var(--color-brand)] text-white shadow-[0_6px_18px_color-mix(in_oklch,var(--color-brand)_32%,transparent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-black/[0.04] hover:text-[var(--color-text-primary)] dark:hover:bg-white/[0.08]',
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.35 : 2} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-[1.1rem] border border-[var(--color-border-subtle)] bg-black/[0.03] p-3 dark:bg-white/[0.05]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <div
            className="flex size-9 items-center justify-center rounded-full bg-[var(--color-brand)]/15 text-[12px] font-bold text-[var(--color-brand)]"
            aria-hidden
          >
            {initials(user.fullName)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{user.fullName}</p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">
              {user.sipExtension ? `Raqam ${user.sipExtension}` : user.roles.join(', ')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 w-full justify-start rounded-xl"
          onClick={() => void logout()}
        >
          <LogOut className="size-4" strokeWidth={2.25} /> Chiqish
        </Button>
      </div>
    </>
  );

  return (
    <SoftphoneProvider>
      <div className="flex min-h-screen">
        <aside className="glass animate-nav-in sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col border-r-0 lg:flex">
          {nav}
        </aside>

        {navOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              aria-label="Menyuni yopish"
              onClick={() => setNavOpen(false)}
            />
            <aside className="glass-strong absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col animate-nav-in">
              {nav}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-20 mx-3 mt-3 flex h-14 items-center justify-between gap-3 rounded-[1.15rem] px-3 sm:mx-5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="pressable flex size-10 items-center justify-center rounded-full bg-black/[0.04] lg:hidden dark:bg-white/10"
                onClick={() => setNavOpen(true)}
                aria-label="Menyuni ochish"
              >
                <Menu className="size-5" strokeWidth={2.25} />
              </button>
              <OperatorStatusControl />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="pressable flex size-10 items-center justify-center rounded-full bg-[var(--color-brand)]/12 text-[var(--color-brand)] xl:hidden"
                onClick={() => setPhoneOpen(true)}
                aria-label="Softfonni ochish"
              >
                <PhoneCall className="size-[18px]" strokeWidth={2.25} />
              </button>
              <ThemeToggle />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <main className="animate-fade-up min-w-0 flex-1 overflow-auto p-4 sm:p-6">{children}</main>
            <aside className="hidden w-[21rem] shrink-0 space-y-4 overflow-y-auto p-4 xl:block">
              <SoftphonePanel />
              <LiveTranscriptPanel />
            </aside>
          </div>
        </div>

        {phoneOpen ? (
          <div className="fixed inset-0 z-40 xl:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              aria-label="Softfonni yopish"
              onClick={() => setPhoneOpen(false)}
            />
            <div className="glass-strong absolute inset-x-0 bottom-0 max-h-[92vh] space-y-3 overflow-y-auto rounded-t-[1.75rem] p-4 animate-sheet-up">
              <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-black/15 dark:bg-white/20" />
              <div className="flex items-center justify-between px-1">
                <p className="text-[17px] font-semibold tracking-[-0.02em]">Softfon</p>
                <button
                  type="button"
                  className="pressable flex size-10 items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/10"
                  onClick={() => setPhoneOpen(false)}
                  aria-label="Yopish"
                >
                  <X className="size-5" strokeWidth={2.25} />
                </button>
              </div>
              <SoftphonePanel />
              <LiveTranscriptPanel />
            </div>
          </div>
        ) : null}
      </div>

      <ScreenPop />
    </SoftphoneProvider>
  );
}
