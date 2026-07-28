'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Plus, Search, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api, tokenStore } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { contactName, formatPhone, timeAgo } from '@/lib/utils';
import type { Contact, DuplicateGroup, ImportResult, Paged } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Spinner } from '@/components/ui';
import { ContactFormDialog } from '@/components/crm/contact-form-dialog';
import { DuplicatesPanel } from '@/components/crm/duplicates-panel';

const PAGE_SIZE = 25;

export default function ContactsPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const canWrite = user ? hasPermission(user.roles, 'contact:write') : false;
  const canImport = user ? hasPermission(user.roles, 'contact:import') : false;
  const canSeeAll = user ? hasPermission(user.roles, 'contact:read:all') : false;

  const contacts = useQuery({
    queryKey: ['contacts', { search, page }],
    queryFn: () =>
      api.get<Paged<Contact>>('/contacts', {
        query: { search: search || undefined, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: (previous) => previous,
  });

  const duplicates = useQuery({
    queryKey: ['contacts', 'duplicates'],
    queryFn: () => api.get<DuplicateGroup[]>('/contacts/duplicates'),
    enabled: canSeeAll,
    staleTime: 60_000,
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) =>
      api.post<ImportResult>('/contacts/import', { csv, onDuplicate: 'skip' }),
    onSuccess: (result) => {
      toast.success(
        `Import tugadi: ${result.created} yangi, ${result.updated} yangilandi, ${result.skipped} o'tkazib yuborildi`,
      );
      if (result.errorCount > 0) {
        toast.warning(`${result.errorCount} qatorda xato bor`);
      }
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateCount = duplicates.data?.length ?? 0;

  const exportCsv = async () => {
    // Fayl yuklab olish uchun `fetch` orqali blob olamiz — `api` JSON kutadi.
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const response = await fetch(`${base}/api/v1/contacts/export`, {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` },
    });
    if (!response.ok) {
      toast.error("Eksport qilib bo'lmadi");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aicc-contacts.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const rows = useMemo(() => contacts.data?.items ?? [], [contacts.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Mijozlar</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {contacts.data ? `${contacts.data.total} ta kartochka` : 'Yuklanmoqda...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSeeAll && duplicateCount > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDuplicates((value) => !value)}
            >
              <Copy className="size-4" />
              Duplikatlar
              <Badge tone="warning">{duplicateCount}</Badge>
            </Button>
          ) : null}

          {canSeeAll ? (
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
              <Download className="size-4" /> CSV
            </Button>
          ) : null}

          {canImport ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  importCsv.mutate(await file.text());
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={importCsv.isPending}
              >
                {importCsv.isPending ? <Spinner /> : <Upload className="size-4" />} Import
              </Button>
            </>
          ) : null}

          {canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Yangi mijoz
            </Button>
          ) : null}
        </div>
      </div>

      {showDuplicates && duplicates.data ? (
        <DuplicatesPanel
          groups={duplicates.data}
          onMerged={() => {
            void queryClient.invalidateQueries({ queryKey: ['contacts'] });
          }}
        />
      ) : null}

      <Card>
        <CardHeader
          title="Kartochkalar"
          action={
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                className="h-9 pl-9"
                placeholder="Ism, kompaniya yoki raqam"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          }
        />

        {contacts.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-5 text-[var(--color-brand)]" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Kartochka topilmadi"
            hint={search ? "Boshqa so'rov bilan qidirib ko'ring" : "Birinchi mijozni qo'shing"}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-muted)]">
              <tr className="border-b border-[var(--color-border-subtle)]">
                <th className="px-5 py-2 font-medium">Mijoz</th>
                <th className="px-5 py-2 font-medium">Telefon</th>
                <th className="px-5 py-2 font-medium">Kompaniya</th>
                <th className="px-5 py-2 font-medium">Teglar</th>
                <th className="px-5 py-2 font-medium">Mas'ul</th>
                <th className="px-5 py-2 font-medium">Oxirgi o'zgarish</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-medium text-[var(--color-brand)] hover:underline"
                    >
                      {contactName(contact)}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs tabular-nums">
                    {contact.phones[0] ? formatPhone(contact.phones[0].phone) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-[var(--color-text-muted)]">
                    {contact.company ?? '—'}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-[var(--color-text-muted)]">
                    {contact.owner?.fullName ?? '—'}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-[var(--color-text-muted)]">
                    {timeAgo(contact.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {contacts.data && contacts.data.pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-5 py-3 text-xs">
            <span className="text-[var(--color-text-muted)]">
              {contacts.data.page} / {contacts.data.pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Oldingi
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= contacts.data.pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                Keyingi
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {creating ? (
        <ContactFormDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['contacts'] });
          }}
        />
      ) : null}

      {!canSeeAll ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Users className="size-3.5" /> Siz faqat o'zingizga biriktirilgan kartochkalarni
          ko'ryapsiz.
        </p>
      ) : null}
    </div>
  );
}
