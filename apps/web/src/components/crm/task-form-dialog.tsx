'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Colleague, Task, TaskPriority } from '@/lib/types';
import { Button, Dialog, Field, Input, Select, Spinner, Textarea } from '@/components/ui';

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: 'Past' },
  { value: 'NORMAL', label: 'Oddiy' },
  { value: 'HIGH', label: 'Yuqori' },
  { value: 'URGENT', label: 'Shoshilinch' },
];

export function TaskFormDialog({
  task,
  contactId,
  dealId,
  onClose,
  onSaved,
}: {
  task?: Task;
  contactId?: string;
  dealId?: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'NORMAL');
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? '');
  const [dueAt, setDueAt] = useState(
    task?.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '',
  );

  const colleagues = useQuery({
    queryKey: ['colleagues'],
    queryFn: () => api.get<Colleague[]>('/users/colleagues'),
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: (): Promise<Task> => {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        contactId: contactId ?? task?.contact?.id ?? undefined,
        dealId: dealId ?? task?.deal?.id ?? undefined,
      };
      return task
        ? api.patch<Task>(`/tasks/${task.id}`, payload)
        : api.post<Task>('/tasks', payload);
    },
    onSuccess: (saved) => {
      toast.success(task ? 'Vazifa yangilandi' : 'Vazifa yaratildi');
      onSaved(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      title={task ? 'Vazifani tahrirlash' : 'Yangi vazifa'}
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
        <Field label="Sarlavha *">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </Field>

        <Field label="Tavsif">
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Muhimlik">
            <Select
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Muddat">
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Mas'ul">
          <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">O'zimga</option>
            {colleagues.data?.map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {colleague.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
