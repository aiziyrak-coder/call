'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ROLES, type Role } from '@aicc/shared';
import { api } from '@/lib/api-client';
import type { AdminUser } from '@/lib/types';
import { Button, Dialog, Field, Input, Spinner } from '@/components/ui';

const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: 'Operator',
  SUPERVISOR: 'Nazoratchi',
  MANAGER: 'Menejer',
  ADMIN: 'Administrator',
  AI_AGENT: 'AI-agent',
};

export function UserFormDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [sipExtension, setSipExtension] = useState(user?.sipExtension ?? '');
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? ['OPERATOR']);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        roles,
        sipExtension: sipExtension.trim(),
        ...(password ? { password } : {}),
      };

      return user
        ? api.patch(`/admin/users/${user.id}`, payload)
        : api.post('/admin/users', {
            ...payload,
            email: email.trim(),
            password,
            phone: phone.trim() || undefined,
            sipExtension: sipExtension.trim() || undefined,
          });
    },
    onSuccess: () => {
      toast.success(user ? 'Saqlandi' : 'Foydalanuvchi yaratildi');
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid =
    fullName.trim().length > 0 &&
    roles.length > 0 &&
    (user ? true : email.trim().length > 3 && password.length >= 8);

  return (
    <Dialog
      title={user ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner /> : null} Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="To'liq ism">
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} autoFocus />
        </Field>

        {user ? null : (
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        )}

        <Field label="Telefon">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>

        <Field
          label={user ? 'Yangi parol' : 'Parol'}
          hint={user ? "Bo'sh qoldirilsa o'zgarmaydi" : 'Kamida 8 belgi'}
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Field
          label="SIP raqami"
          hint="Brauzer softfoni shu raqam bilan ro'yxatdan o'tadi. Bo'sh qoldirilsa softfon o'chadi."
        >
          <Input
            inputMode="numeric"
            value={sipExtension}
            onChange={(event) => setSipExtension(event.target.value)}
            placeholder="1001"
          />
        </Field>

        <Field label="Rollar">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => {
              const checked = roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() =>
                    setRoles((current) =>
                      checked ? current.filter((item) => item !== role) : [...current, role],
                    )
                  }
                  className={
                    checked
                      ? 'rounded-lg border border-[var(--color-brand)] bg-[var(--color-brand)]/10 px-3 py-1.5 text-xs'
                      : 'rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]'
                  }
                >
                  {ROLE_LABEL[role]}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
