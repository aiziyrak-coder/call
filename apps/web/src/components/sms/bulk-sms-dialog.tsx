'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { SmsTemplate } from '@/lib/types';
import { Button, Dialog, Field, Input, Select, Spinner, Textarea } from '@/components/ui';

interface BulkResult {
  queued: number;
  total: number;
  skipped: Array<{ contactId: string; reason: string }>;
}

/** Segment (teg) bo'yicha ommaviy yuborish — TZ 5.6. */
export function BulkSmsDialog({
  templates,
  onClose,
  onSent,
}: {
  templates: SmsTemplate[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [tag, setTag] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState('');

  const send = useMutation({
    mutationFn: () =>
      api.post<BulkResult>('/sms/bulk', {
        tag: tag.trim() || undefined,
        templateId: templateId || undefined,
        text: templateId ? undefined : text.trim(),
      }),
    onSuccess: (result) => {
      toast.success(`${result.queued} ta xabar navbatga qo'yildi (${result.total} mijozdan)`);
      if (result.skipped.length > 0) {
        toast.warning(`${result.skipped.length} ta mijozda raqam yo'q`);
      }
      onSent();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = templates.find((template) => template.id === templateId);

  return (
    <Dialog
      title="Ommaviy SMS"
      description="Teg bo'yicha tanlangan mijozlarga yuboriladi"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            size="sm"
            disabled={!tag.trim() || (!text.trim() && !templateId) || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? <Spinner /> : null} Yuborish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Segment (teg)" hint="Masalan: vip, qarzdor">
          <Input value={tag} onChange={(event) => setTag(event.target.value)} autoFocus />
        </Field>

        <Field label="Shablon">
          <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Shablonsiz</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Matn"
          hint="{{ism}}, {{familiya}}, {{kompaniya}} o'zgaruvchilari qo'llab-quvvatlanadi"
        >
          <Textarea
            rows={4}
            value={selected ? selected.body : text}
            disabled={Boolean(selected)}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
