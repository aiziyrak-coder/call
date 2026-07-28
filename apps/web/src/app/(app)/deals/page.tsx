'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission } from '@aicc/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/stores';
import { cn, contactName, formatMoney } from '@/lib/utils';
import type { Deal, PipelineBoard } from '@/lib/types';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';
import { DealFormDialog } from '@/components/crm/deal-form-dialog';

interface DragState {
  dealId: string;
  fromStageId: string;
}

export default function DealsPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ stageId: string; index: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const canWrite = user ? hasPermission(user.roles, 'deal:write') : false;

  const board = useQuery({
    queryKey: ['deals', 'board'],
    queryFn: () => api.get<PipelineBoard>('/deals/board'),
  });

  const move = useMutation({
    mutationFn: ({ id, stageId, position }: { id: string; stageId: string; position: number }) =>
      api.post<Deal>(`/deals/${id}/move`, { stageId, position }),
    // Optimistik yangilash: kartochka sichqoncha qo'yib yuborilishi bilan joyiga tushadi.
    onMutate: async ({ id, stageId, position }) => {
      await queryClient.cancelQueries({ queryKey: ['deals', 'board'] });
      const previous = queryClient.getQueryData<PipelineBoard>(['deals', 'board']);
      if (!previous) return { previous };

      let moved: Deal | undefined;
      const stripped = previous.stages.map((stage) => {
        const found = stage.deals.find((deal) => deal.id === id);
        if (found) moved = found;
        return { ...stage, deals: stage.deals.filter((deal) => deal.id !== id) };
      });

      if (moved) {
        const target = stripped.find((stage) => stage.id === stageId);
        target?.deals.splice(position, 0, { ...moved, stageId });
      }

      queryClient.setQueryData<PipelineBoard>(['deals', 'board'], {
        ...previous,
        stages: stripped.map((stage) => ({
          ...stage,
          totalAmount: stage.deals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0),
        })),
      });

      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['deals', 'board'], context.previous);
      toast.error(error.message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals', 'board'] });
    },
  });

  if (board.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-[var(--color-brand)]" />
      </div>
    );
  }

  if (!board.data) return <EmptyState title="Voronka topilmadi" />;

  const drop = (stageId: string, index: number) => {
    if (!drag) return;
    const sourceStage = board.data?.stages.find((stage) => stage.id === drag.fromStageId);
    const fromIndex = sourceStage?.deals.findIndex((deal) => deal.id === drag.dealId) ?? -1;
    // Server siblings ro'yxatida dragged kartochka yo'q — pastga tortganda indeksni tuzatamiz.
    const position =
      drag.fromStageId === stageId && fromIndex >= 0 && fromIndex < index ? index - 1 : index;
    setDrag(null);
    setDropTarget(null);
    move.mutate({ id: drag.dealId, stageId, position: Math.max(0, position) });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{board.data.pipeline.name}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Kartochkani ushlab boshqa bosqichga tashlang
          </p>
        </div>
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Yangi bitim
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {board.data.stages.map((stage) => (
          <div
            key={stage.id}
            className="flex w-72 shrink-0 flex-col rounded-[var(--radius-panel)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
            onDragOver={(event) => {
              if (!drag) return;
              event.preventDefault();
              setDropTarget({ stageId: stage.id, index: stage.deals.length });
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(
                stage.id,
                dropTarget?.stageId === stage.id ? dropTarget.index : stage.deals.length,
              );
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: stage.color }}
                  aria-hidden
                />
                {stage.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{stage.deals.length}</span>
            </div>

            <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
              {formatMoney(stage.totalAmount)}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {stage.deals.map((deal, index) => (
                <article
                  key={deal.id}
                  draggable={canWrite}
                  onDragStart={() => setDrag({ dealId: deal.id, fromStageId: stage.id })}
                  onDragEnd={() => {
                    setDrag(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    if (!drag) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setDropTarget({ stageId: stage.id, index });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    drop(stage.id, index);
                  }}
                  className={cn(
                    'group rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2.5',
                    canWrite && 'cursor-grab active:cursor-grabbing',
                    drag?.dealId === deal.id && 'opacity-40',
                    dropTarget?.stageId === stage.id &&
                      dropTarget.index === index &&
                      'border-[var(--color-brand)]',
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    {canWrite ? (
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{deal.title}</p>
                      {deal.contact ? (
                        <Link
                          href={`/contacts/${deal.contact.id}`}
                          className="truncate text-xs text-[var(--color-brand)] hover:underline"
                        >
                          {contactName(deal.contact)}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tabular-nums">
                      {formatMoney(deal.amount, deal.currency)}
                    </span>
                    {deal.owner ? <Badge>{deal.owner.fullName.split(' ')[0]}</Badge> : null}
                  </div>
                </article>
              ))}

              {stage.deals.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-[var(--color-text-muted)]">
                  Bo'sh
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <DealFormDialog
          pipelineId={board.data.pipeline.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['deals', 'board'] });
          }}
        />
      ) : null}
    </div>
  );
}
