'use client';

import { CalendarClock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { rescheduleTaskAction } from '@/server/actions/taskActions';
import styles from './CalendarTaskMove.module.css';

function useTaskMove() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function move(taskId: string, date: string) {
    startTransition(async () => {
      const outcome = await rescheduleTaskAction(taskId, date);
      setResult(outcome.status === 'success' ? { status: 'idle' } : outcome);
      if (outcome.status === 'success') router.refresh();
    });
  }

  return { result, isPending, move };
}

// Lets a person drag their own open tasks to another day. The calendar marks movable
// tasks with data-task-id and each day with data-drop-date; this listens around it.
export function CalendarDragArea({ children }: { children: ReactNode }) {
  const { result, isPending, move } = useTaskMove();
  const dragged = useRef<{ taskId: string; from: string } | null>(null);
  const target = useRef<HTMLElement | null>(null);

  function setTarget(element: HTMLElement | null) {
    if (target.current === element) return;
    target.current?.removeAttribute('data-drop-target');
    element?.setAttribute('data-drop-target', 'true');
    target.current = element;
  }

  function dayAt(event: DragEvent) {
    return (event.target as HTMLElement).closest<HTMLElement>('[data-drop-date]');
  }

  function onDragStart(event: DragEvent) {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-task-id]');
    if (!item?.dataset.taskId || !item.dataset.date) return;
    dragged.current = { taskId: item.dataset.taskId, from: item.dataset.date };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.taskId);
  }

  function onDragOver(event: DragEvent) {
    const day = dayAt(event);
    if (!dragged.current || !day) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTarget(day);
  }

  function onDrop(event: DragEvent) {
    const day = dayAt(event);
    const task = dragged.current;
    setTarget(null);
    dragged.current = null;
    if (!task || !day?.dataset.dropDate) return;
    event.preventDefault();
    if (day.dataset.dropDate !== task.from) move(task.taskId, day.dataset.dropDate);
  }

  function onDragEnd() {
    setTarget(null);
    dragged.current = null;
  }

  return (
    <div
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
      }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      data-busy={isPending}
      className={styles.area}
    >
      <FormMessage result={result} />
      {isPending && <p className={styles.status}>Moving the task…</p>}
      {children}
    </div>
  );
}

// The same, without dragging: pick a new day. Works on phones too.
export function TaskMoveButton({ taskId, date, title }: { taskId: string; date: string; title: string }) {
  const { result, isPending, move } = useTaskMove();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span className={styles.mover}>
      <button
        type="button"
        className={styles.button}
        disabled={isPending}
        aria-label={`Move ${title} to another day`}
        title="Move to another day"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          try {
            input.showPicker();
          } catch {
            input.focus();
          }
        }}
      >
        <CalendarClock size={14} aria-hidden="true" />
        {isPending ? 'Moving…' : 'Move'}
      </button>
      <input
        ref={inputRef}
        type="date"
        className={styles.dateInput}
        defaultValue={date}
        aria-label={`New date for ${title}`}
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.value && event.target.value !== date) move(taskId, event.target.value);
        }}
      />
      {result.status === 'error' && <FormMessage result={result} />}
    </span>
  );
}
