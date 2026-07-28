'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { contactName } from '@/lib/utils';
import type { Contact, Deal, Paged, Pipeline } from '@/lib/types';
import { Button, Dialog, Field, Input, Select, Spinner } from '@/components/ui';

export function DealFormDialog({
  pipelineId,
  contactId,
  onClose,
  onSaved,
}: {
  pipelineId?: string;
  contactId?: string;
  onClose: () => void;
  onSaved: (deal: Deal) => void;
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedContact, setSelectedContact] = useState(contactId ?? '');
  const [stageId, setStageId] = useState('');
  const [search, setSearch] = useState('');

  const pipelines = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.get<Pipeline[]>('/pipelines'),
    staleTime: 5 * 60_000,
  });

  const contacts = useQuery({
    queryKey: ['contacts', { search, page: 1 }],
    queryFn: () =>
      api.get<Paged<Contact>>('/contacts', {
        query: { search: search || undefined, pageSize: 20 },
      }),
    enabled: !contactId,
  });

  const pipeline =
    pipelines.data?.find((item) => item.id === pipelineId) ??
    pipelines.data?.find((item) => item.isDefault) ??
    pipelines.data?.[0];

  const save = useMutation({
    mutationFn: (): Promise<Deal> => {
      const parsedAmount = amount.trim() ? Number(amount) : undefined;
      if (parsedAmount !== undefined && !Number.isFinite(parsedAmount)) {
        throw new Error("Summa noto'g'ri");
      }
      return api.post<Deal>('/deals', {
        title: title.trim(),
        amount: parsedAmount,
        contactId: selectedContact || undefined,
        pipelineId: pipeline?.id,
        stageId: stageId || undefined,
      });
    },
    onSuccess: (deal) => {
      toast.success('Bitim yaratildi');
      onSaved(deal);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      title="Yangi bitim"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            size="sm"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Spinner /> : null} Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nomi *">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Summa">
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Bosqich">
            <Select value={stageId} onChange={(event) => setStageId(event.target.value)}>
              <option value="">Birinchi bosqich</option>
              {pipeline?.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {contactId ? null : (
          <Field label="Mijoz" hint="Qidirish uchun ism yoki raqam kiriting">
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Qidirish..."
              />
              <Select
                value={selectedContact}
                onChange={(event) => setSelectedContact(event.target.value)}
              >
                <option value="">Biriktirilmagan</option>
                {contacts.data?.items.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactName(contact)}
                    {contact.company ? ` — ${contact.company}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}
