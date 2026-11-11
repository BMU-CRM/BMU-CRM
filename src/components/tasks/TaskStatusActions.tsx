'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import type { ActionResult } from '@/lib/actionResult';
import type { TaskAction } from '@/lib/tasks/taskWorkflow';
import { changeTaskStatusAction } from '@/server/actions/taskActions';
import styles from './TaskStatusActions.module.css';

const ratingOptions = [
  { value: '5', label: '5 · Excellent' },
  { value: '4', label: '4 · Good' },
  { value: '3', label: '3 · Acceptable' },
  { value: '2', label: '2 · Needs improvement' },
  { value: '1', label: '1 · Poor' },
];

function TaskActionButton({ taskId, action }: { taskId: string; action: TaskAction }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const needsDialog = action.needsNote || action.needsRating || action.acceptsWorkLink;

  function run(note: string | null, rating: number | null, workLink: string | null = null) {
    startTransition(async () => {
      const outcome = await changeTaskStatusAction(taskId, action.status, note, rating, workLink);
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  function submitDialog(formData: FormData) {
    const note = String(formData.get('note') ?? '').trim();
    if (action.needsNote && !note) {
      setResult({ status: 'error', message: 'Please add a short note.' });
      return;
    }
    const rating = Number(formData.get('rating'));
    const workLink = String(formData.get('workLink') ?? '').trim();
    run(note || null, rating || null, workLink || null);
  }

  return (
    <>
      <Button
        variant={action.tone}
        disabled={isPending}
        onClick={() => (needsDialog ? dialogRef.current?.showModal() : run(null, null))}
      >
        {isPending && !needsDialog ? 'Working…' : action.label}
      </Button>
      {!needsDialog && result.status === 'error' && <FormMessage result={result} />}

      {needsDialog && (
        <dialog ref={dialogRef} className={dialogStyles.dialog} aria-label={action.label}>
          <h2 className={dialogStyles.title}>{action.label}</h2>
          <KeepValuesForm action={submitDialog} className={styles.form}>
            <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
            {action.needsRating && (
              <SelectField label="Quality of the work" name="rating" id={`rating-${action.status}`} options={ratingOptions} defaultValue="4" />
            )}
            {action.acceptsWorkLink && (
              <TextField
                label="Link to your work (optional)"
                name="workLink"
                id={`work-link-${action.status}`}
                type="url"
                placeholder="https://drive.google.com/…"
                hint="A Google Drive file or folder, or any other https:// link. Files can also be uploaded under Attachments."
              />
            )}
            <TextAreaField
              label={action.needsNote ? 'Note' : 'Note (optional)'}
              name="note"
              id={`note-${action.status}`}
              hint="Saved as a comment on the task."
            />
            <div className={dialogStyles.actions}>
              <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" variant={action.tone} disabled={isPending}>
                {isPending ? 'Working…' : action.label}
              </Button>
            </div>
          </KeepValuesForm>
        </dialog>
      )}
    </>
  );
}

export function TaskStatusActions({ taskId, actions }: { taskId: string; actions: TaskAction[] }) {
  return actions.map((action) => <TaskActionButton key={action.label} taskId={taskId} action={action} />);
}
