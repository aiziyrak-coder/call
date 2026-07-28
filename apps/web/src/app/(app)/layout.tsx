'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { SoftphoneProvider } from '@/components/softphone/softphone-provider';
import { SoftphonePanel } from '@/components/softphone/softphone-panel';
import { LiveTranscriptPanel } from '@/components/ai/live-transcript';
import { ScreenPop } from '@/components/crm/screen-pop';

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setNavOpen(false);
    setPhoneOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-[var(--color-brand)]" />
      </div>
    );
  }

  const logout = async () => {
    await api.post('/auth/logout', {}, { anonymous: true }).catch(() => undefined);
    disconnectSocket();
    tokenStore.clear();
    useAuthStore.getState().setUser(null);
    router.replace('/login');
  };

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user.roles, item.permission),
  );

  const nav = (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-brand)]/12">
          <Headphones className="size-4 text-[var(--color-brand)]" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">AiCC</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">{user.tenant.name}</p>
        </div>
        <button
          type="button"
          className="ml-auto flex size-11 items-center justify-center rounded-lg lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-label="Menyuni yopish"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3" aria-label="Asosiy menyu">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[var(--color-brand)]/12 font-medium text-[var(--color-brand)]'
                  : 'text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border-subtle)] p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <div
            className="flex size-8 items-center justify-center rounded-full bg-[var(--color-brand)]/12 text-xs font-semibold text-[var(--color-brand)]"
            aria-hidden
          >
            {initials(user.fullName)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium">{user.fullName}</p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">
              {user.sipExtension ? `Raqam ${user.sipExtension}` : user.roles.join(', ')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 w-full justify-start"
          onClick={() => void logout()}
        >
          <LogOut className="size-4" /> Chiqish
        </Button>
      </div>
    </>
  );

  return (
    <SoftphoneProvider>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] lg:flex">
          {nav}
        </aside>

        {/* Mobile drawer */}
        {navOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Menyuni yopish"
              onClick={() => setNavOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-[var(--color-surface-raised)] shadow-xl">
              {nav}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-lg lg:hidden"
                onClick={() => setNavOpen(true)}
                aria-label="Menyuni ochish"
              >
                <Menu className="size-5" />
              </button>
              <OperatorStatusControl />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-lg xl:hidden"
                onClick={() => setPhoneOpen(true)}
                aria-label="Softfonni ochish"
              >
                <PhoneCall className="size-5 text-[var(--color-brand)]" />
              </button>
              <ThemeToggle />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">{children}</main>
            <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l border-[var(--color-border-subtle)] p-4 xl:block">
              <SoftphonePanel />
              <LiveTranscriptPanel />
            </aside>
          </div>
        </div>

        {/* Softphone sheet (tablet/mobile) */}
        {phoneOpen ? (
          <div className="fixed inset-0 z-40 xl:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Softfonni yopish"
              onClick={() => setPhoneOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[90vh] space-y-3 overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Softfon</p>
                <button
                  type="button"
                  className="flex size-11 items-center justify-center rounded-lg"
                  onClick={() => setPhoneOpen(false)}
                  aria-label="Yopish"
                >
                  <X className="size-5" />
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
