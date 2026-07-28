'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { cn, contactName, formatDateTime } from '@/lib/utils';
import type { Paged, Task, TaskPriority, TaskStatus } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Select, Spinner } from '@/components/ui';
import { TaskFormDialog } from '@/components/crm/task-form-dialog';

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'brand' | 'warning' | 'negative'> = {
  LOW: 'neutral',
  NORMAL: 'brand',
  HIGH: 'warning',
  URGENT: 'negative',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'Ochiq',
  IN_PROGRESS: 'Jarayonda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilindi',
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatus | ''>('OPEN');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const tasks = useQuery({
    queryKey: ['tasks', { status }],
    queryFn: () =>
      api.get<Paged<Task>>('/tasks', { query: { status: status || undefined, pageSize: 100 } }),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.patch<Task>(`/tasks/${id}`, { status: 'DONE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = tasks.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Vazifalar</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Kunlik ish ro'yxati</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Yangi vazifa
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Ro'yxat"
          action={
            <Select
              className="h-9 w-40"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus | '')}
            >
              <option value="">Barchasi</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          }
        />

        {tasks.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-5 text-[var(--color-brand)]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Vazifa yo'q" hint="Yangi vazifa qo'shing" />
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {items.map((task) => {
              const overdue =
                task.dueAt && task.status !== 'DONE' && new Date(task.dueAt) < new Date();

              return (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <Button
                    size="icon"
                    variant={task.status === 'DONE' ? 'success' : 'secondary'}
                    aria-label="Bajarildi deb belgilash"
                    disabled={task.status === 'DONE' || complete.isPending}
                    onClick={() => complete.mutate(task.id)}
                    className="size-8 shrink-0"
                  >
                    <Check className="size-4" />
                  </Button>

                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditing(task)}
                  >
                    <p
                      className={cn(
                        'truncate text-sm',
                        task.status === 'DONE' && 'text-[var(--color-text-muted)] line-through',
                      )}
                    >
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {task.description}
                      </p>
                    ) : null}
                  </button>

                  {task.contact ? (
                    <Link
                      href={`/contacts/${task.contact.id}`}
                      className="shrink-0 text-xs text-[var(--color-brand)] hover:underline"
                    >
                      {contactName(task.contact)}
                    </Link>
                  ) : null}

                  <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>

                  <span
                    className={cn(
                      'w-40 shrink-0 text-right text-xs',
                      overdue ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-muted)]',
                    )}
                  >
                    {formatDateTime(task.dueAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {creating ? (
        <TaskFormDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      ) : null}

      {editing ? (
        <TaskFormDialog
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      ) : null}
    </div>
  );
}
