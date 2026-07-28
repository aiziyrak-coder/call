'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { formatPhone } from '@/lib/utils';
import type { SmsTemplate } from '@/lib/types';
import { Button, Dialog, Field, Select, Spinner, Textarea } from '@/components/ui';

/** CRM kartochkasidan bitta SMS yuborish. */
export function QuickSmsDialog({
  contactId,
  phones,
  onClose,
}: {
  contactId: string;
  phones: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState(phones[0] ?? '');
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('');

  const templates = useQuery({
    queryKey: ['sms', 'templates'],
    queryFn: () => api.get<SmsTemplate[]>('/sms/templates'),
    staleTime: 5 * 60_000,
  });

  const selected = templates.data?.find((template) => template.id === templateId);

  const send = useMutation({
    mutationFn: () =>
      api.post('/sms', {
        to,
        contactId,
        text: templateId ? undefined : text.trim(),
        templateId: templateId || undefined,
      }),
    onSuccess: () => {
      toast.success("SMS navbatga qo'yildi");
      void queryClient.invalidateQueries({ queryKey: ['contact', contactId, 'timeline'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      title="SMS yuborish"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            size="sm"
            disabled={!to || (!text.trim() && !templateId) || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? <Spinner /> : null} Yuborish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {phones.length > 1 ? (
          <Field label="Raqam">
            <Select value={to} onChange={(event) => setTo(event.target.value)}>
              {phones.map((phone) => (
                <option key={phone} value={phone}>
                  {formatPhone(phone)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {(templates.data?.length ?? 0) > 0 ? (
          <Field label="Shablon">
            <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Shablonsiz</option>
              {templates.data?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Matn">
          <Textarea
            rows={5}
            autoFocus
            value={selected ? selected.body : text}
            disabled={Boolean(selected)}
            onChange={(event) => setText(event.target.value)}
            placeholder="Xabar matni..."
          />
        </Field>
      </div>
    </Dialog>
  );
}
