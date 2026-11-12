'use client';

import { CalendarPlus, ListPlus, Palette, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { formatDate } from '@/lib/formatDate';
import { priorityLabels } from '@/lib/tasks/taskWorkflow';
import { addContentWorkAction } from '@/server/actions/meetingActions';
import { createMyTaskAction } from '@/server/actions/taskActions';
import styles from './CalendarDayMenu.module.css';

const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

function AddMyTaskForm({ day, onDone }: { day: string; onDone: () => void }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const outcome = await createMyTaskAction({
            title: String(data.get('title') ?? ''),
            dueDate: String(data.get('dueDate') ?? ''),
            dueTime: String(data.get('dueTime') ?? ''),
            priority: String(data.get('priority') ?? 'medium'),
          });
          setResult(outcome);
          if (outcome.status === 'success') {
            router.refresh();
            onDone();
          }
        });
      }}
    >
      <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
      <TextField label="What do you need to do?" name="title" id="my-task-title" required autoFocus error={result.fieldErrors?.title} />
      <div className={styles.row}>
        <TextField label="Date" name="dueDate" id="my-task-date" type="date" defaultValue={day} required error={result.fieldErrors?.dueDate} />
        <TextField label="Time (optional)" name="dueTime" id="my-task-time" type="time" error={result.fieldErrors?.dueTime} />
      </div>
      <SelectField label="Priority" name="priority" id="my-task-priority" options={priorityOptions} defaultValue="medium" />
      <p className={styles.hint}>A task for yourself. Nobody is assigned anything; mark it complete when it is done.</p>
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}

export type ContentCategoryChoice = { value: string; label: string; people: string[] };

// Content work for a category's people, added straight from a day. Each of them gets it
// in their calendar as a task to start and submit.
function AddContentWorkForm({ day, categories, onDone }: { day: string; categories: ContentCategoryChoice[]; onDone: () => void }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState('');
  const category = categories.find((option) => option.value === categoryId);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const outcome = await addContentWorkAction({
            title: String(data.get('title') ?? ''),
            categoryId,
            date: String(data.get('date') ?? ''),
            startTime: String(data.get('startTime') ?? ''),
            endTime: String(data.get('endTime') ?? ''),
            brief: String(data.get('brief') ?? ''),
          });
          setResult(outcome);
          if (outcome.status === 'success') {
            router.refresh();
            onDone();
          }
        });
      }}
    >
      <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
      <SelectField
        label="Category"
        name="categoryId"
        id="content-category"
        options={categories}
        placeholder="Choose a category"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        hint={
          category
            ? category.people.length > 0
              ? `Goes to ${category.people.join(', ')}, as a task in their calendar.`
              : 'Nobody is set up for this category yet: add people in Settings, Content calendar.'
            : undefined
        }
        error={result.fieldErrors?.categoryId}
      />
      <TextField label="What is it?" name="title" id="content-title" placeholder="For example: Diwali offer poster" required error={result.fieldErrors?.title} />
      <TextField label="Date" name="date" id="content-date" type="date" defaultValue={day} required error={result.fieldErrors?.date} />
      <div className={styles.row}>
        <TextField label="From" name="startTime" id="content-start" type="time" defaultValue="10:00" required error={result.fieldErrors?.startTime} />
        <TextField label="To" name="endTime" id="content-end" type="time" defaultValue="11:00" required error={result.fieldErrors?.endTime} />
      </div>
      <TextAreaField label="Brief (optional)" name="brief" id="content-brief" rows={3} error={result.fieldErrors?.agenda} />
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add content work'}
        </Button>
      </div>
    </form>
  );
}

// Clicking a free spot on any day offers to add your own task, content work for a
// category or a meeting there. Clicks on tasks, meetings and buttons keep doing what they do.
export function CalendarDayMenu({
  canAddTasks,
  contentCategories,
  children,
}: {
  canAddTasks: boolean;
  // For people who plan content.
  contentCategories?: ContentCategoryChoice[];
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<{ day: string; x: number; y: number } | null>(null);
  const [taskDay, setTaskDay] = useState<string | null>(null);
  const [contentDay, setContentDay] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (taskDay && !dialog.open) dialog.showModal();
    if (!taskDay && dialog.open) dialog.close();
  }, [taskDay]);

  useEffect(() => {
    const dialog = contentRef.current;
    if (!dialog) return;
    if (contentDay && !dialog.open) dialog.showModal();
    if (!contentDay && dialog.open) dialog.close();
  }, [contentDay]);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, label, dialog')) return;
    const day = target.closest<HTMLElement>('[data-drop-date]')?.dataset.dropDate;
    if (!day) return;
    const width = 240;
    setMenu({ day, x: Math.min(event.clientX, window.innerWidth - width - 12), y: event.clientY });
  }

  return (
    <div onClick={onClick} className={styles.area}>
      {children}

      {menu && (
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={`Add to ${formatDate(menu.day)}`}
          style={{ left: menu.x, top: menu.y }}
        >
          <p className={styles.menuTitle}>{formatDate(menu.day)}</p>
          {contentCategories && contentCategories.length > 0 && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setContentDay(menu.day);
                setMenu(null);
              }}
            >
              <Palette size={16} aria-hidden="true" /> Add content work
            </button>
          )}
          {canAddTasks && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setTaskDay(menu.day);
                setMenu(null);
              }}
            >
              <ListPlus size={16} aria-hidden="true" /> Add my task
            </button>
          )}
          <Link role="menuitem" href={`/meetings/new?date=${menu.day}`} className={styles.item}>
            <CalendarPlus size={16} aria-hidden="true" /> Schedule meeting
          </Link>
        </div>
      )}

      <dialog ref={dialogRef} className={`${dialogStyles.dialog} ${styles.dialog}`} aria-label="Add my task" onClose={() => setTaskDay(null)}>
        <div className={styles.dialogHead}>
          <h2 className={dialogStyles.title}>Add my task</h2>
          <button type="button" className={styles.close} onClick={() => setTaskDay(null)} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {taskDay && <AddMyTaskForm day={taskDay} onDone={() => setTaskDay(null)} />}
      </dialog>

      {contentCategories && (
        <dialog ref={contentRef} className={`${dialogStyles.dialog} ${styles.dialog}`} aria-label="Add content work" onClose={() => setContentDay(null)}>
          <div className={styles.dialogHead}>
            <h2 className={dialogStyles.title}>Add content work</h2>
            <button type="button" className={styles.close} onClick={() => setContentDay(null)} aria-label="Close">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {contentDay && <AddContentWorkForm day={contentDay} categories={contentCategories} onDone={() => setContentDay(null)} />}
        </dialog>
      )}
    </div>
  );
}
