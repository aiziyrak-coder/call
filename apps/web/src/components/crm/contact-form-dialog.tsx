'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Contact } from '@/lib/types';
import { Button, Dialog, Field, Input, Spinner, Textarea } from '@/components/ui';

interface PhoneRow {
  phone: string;
  label: string;
}

interface ContactFormDialogProps {
  contact?: Contact;
  /** Kiruvchi qo'ng'iroqdan yangi kartochka ochilganda raqam oldindan to'ldiriladi. */
  initialPhone?: string;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}

export function ContactFormDialog({
  contact,
  initialPhone,
  onClose,
  onSaved,
}: ContactFormDialogProps) {
  const [firstName, setFirstName] = useState(contact?.firstName ?? '');
  const [lastName, setLastName] = useState(contact?.lastName ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [tags, setTags] = useState(contact?.tags.join(', ') ?? '');
  const [phones, setPhones] = useState<PhoneRow[]>(
    contact?.phones.map((phone) => ({ phone: phone.phone, label: phone.label ?? '' })) ?? [
      { phone: initialPhone ?? '', label: 'mobil' },
    ],
  );

  const save = useMutation({
    mutationFn: (): Promise<Contact> => {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        phones: phones
          .filter((row) => row.phone.trim())
          .map((row, index) => ({
            phone: row.phone.trim(),
            label: row.label.trim() || undefined,
            isPrimary: index === 0,
          })),
      };

      return contact
        ? api.patch<Contact>(`/contacts/${contact.id}`, payload)
        : api.post<Contact>('/contacts', payload);
    },
    onSuccess: (saved) => {
      toast.success(contact ? 'Kartochka yangilandi' : 'Kartochka yaratildi');
      onSaved(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disabled = !firstName.trim() || save.isPending;

  return (
    <Dialog
      title={contact ? 'Kartochkani tahrirlash' : 'Yangi mijoz'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner /> : null} Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ism *">
            <Input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Familiya">
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
        </div>

        <Field label="Telefon raqamlari" hint="Birinchi raqam asosiy hisoblanadi">
          <div className="space-y-2">
            {phones.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="+998 90 123 45 67"
                  value={row.phone}
                  onChange={(event) =>
                    setPhones((rows) =>
                      rows.map((item, at) =>
                        at === index ? { ...item, phone: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  className="w-28"
                  placeholder="mobil"
                  value={row.label}
                  onChange={(event) =>
                    setPhones((rows) =>
                      rows.map((item, at) =>
                        at === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Raqamni o'chirish"
                  disabled={phones.length === 1}
                  onClick={() => setPhones((rows) => rows.filter((_, at) => at !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPhones((rows) => [...rows, { phone: '', label: '' }])}
            >
              <Plus className="size-4" /> Raqam qo'shish
            </Button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kompaniya">
            <Input value={company} onChange={(event) => setCompany(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
        </div>

        <Field label="Manzil">
          <Input value={address} onChange={(event) => setAddress(event.target.value)} />
        </Field>

        <Field label="Teglar" hint="Vergul bilan ajrating">
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="vip, qaytgan mijoz"
          />
        </Field>

        <Field label="Izoh">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
