'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ROLES, hasPermission, type Role } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { formatDateTime } from '@/lib/utils';
import type { AdminUser, Paged } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Spinner,
} from '@/components/ui';
import { UserFormDialog } from './user-form-dialog';

const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: 'Operator',
  SUPERVISOR: 'Nazoratchi',
  MANAGER: 'Menejer',
  ADMIN: 'Administrator',
  AI_AGENT: 'AI-agent',
};

export function UsersTab() {
  const me = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  const canWrite = me ? hasPermission(me.roles, 'user:write') : false;

  const users = useQuery({
    queryKey: ['admin', 'users', search, role],
    queryFn: () =>
      api.get<Paged<AdminUser>>('/admin/users', {
        query: { search: search || undefined, role: role || undefined, pageSize: 100 },
      }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post<{ revoked: number }>(`/admin/users/${id}/revoke-sessions`),
    onSuccess: (result) => toast.success(`${result.revoked} ta sessiya bekor qilindi`),
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: (user: AdminUser) =>
      api.patch(`/admin/users/${user.id}`, { isActive: !user.isActive }),
    onSuccess: () => {
      toast.success('Holat yangilandi');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success("Foydalanuvchi o'chirildi");
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Foydalanuvchilar"
        description="Rollar, SIP raqamlari va hisob holati"
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Qo&apos;shish
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 px-5 py-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            className="pl-9"
            placeholder="Ism, email yoki raqam"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select className="w-48" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">Barcha rollar</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {ROLE_LABEL[item]}
            </option>
          ))}
        </Select>
      </div>

      {users.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-[var(--color-brand)]" />
        </div>
      ) : (users.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Foydalanuvchi topilmadi" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-muted)]">
              <tr className="border-y border-[var(--color-border-subtle)]">
                <th className="px-5 py-2 font-medium">Foydalanuvchi</th>
                <th className="px-3 py-2 font-medium">Rollar</th>
                <th className="px-3 py-2 font-medium">SIP</th>
                <th className="px-3 py-2 font-medium">Holat</th>
                <th className="px-3 py-2 font-medium">Oxirgi kirish</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {users.data?.items.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium">{user.fullName}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{user.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((item) => (
                        <Badge key={item}>{ROLE_LABEL[item]}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular-nums">
                    {user.sipExtension ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={user.isActive ? 'positive' : 'neutral'}>
                      {user.isActive ? user.status : 'BLOKLANGAN'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'hech qachon'}
                  </td>
                  <td className="px-5 py-2.5">
                    {canWrite ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Tahrirlash"
                          onClick={() => setEditing(user)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Sessiyalarni bekor qilish"
                          title="Barcha sessiyalarni bekor qilish"
                          onClick={() => revoke.mutate(user.id)}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={user.id === me?.id}
                          onClick={() => toggleActive.mutate(user)}
                        >
                          {user.isActive ? 'Bloklash' : 'Faollashtirish'}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="O'chirish"
                          title="O'chirish"
                          disabled={user.id === me?.id || remove.isPending}
                          className="text-[var(--color-negative)]"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `"${user.fullName}" foydalanuvchisini o'chirishni tasdiqlaysizmi?`,
                              )
                            ) {
                              return;
                            }
                            remove.mutate(user.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <UserFormDialog
          user={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      ) : null}
    </Card>
  );
}
