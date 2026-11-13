'use client';

import { Send } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import type { ActionResult } from '@/lib/actionResult';
import { sendTaskFilesAction } from '@/server/actions/taskActions';
import styles from './TaskSendFiles.module.css';

type TaskSendFilesProps = {
  taskId: string;
  // Files this person added that the assigner has not been sent yet.
  unsentCount: number;
  // Who receives them: whoever assigned the task, and its reviewer.
  recipientNames: string;
};

// Lets the person doing the work tell whoever assigned the task about files they added,
// for example after submitting it. Only files not sent before are sent.
export function TaskSendFiles({ taskId, unsentCount, recipientNames }: TaskSendFilesProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const files = `${unsentCount} new ${unsentCount === 1 ? 'file' : 'files'}`;

  function submit(formData: FormData) {
    const note = String(formData.get('note') ?? '').trim();
    startTransition(async () => {
      const outcome = await sendTaskFilesAction(taskId, note || null);
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  return (
    <div className={styles.bar}>
      {unsentCount > 0 ? (
        <>
          <p className={styles.text}>
            {files} not sent to {recipientNames} yet.
          </p>
          <Button variant="primary" onClick={() => dialogRef.current?.showModal()} disabled={isPending}>
            <Send size={16} aria-hidden="true" />
            Send to {recipientNames}
          </Button>
        </>
      ) : (
        result.status === 'success' && <FormMessage result={result} />
      )}

      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-label={`Send files to ${recipientNames}`}>
        <h2 className={dialogStyles.title}>Send files to {recipientNames}</h2>
        <p className={dialogStyles.description}>
          They are notified about the {files} you added, with a link to this task.
        </p>
        <KeepValuesForm action={submit} className={styles.form}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <TextAreaField label="Note (optional)" name="note" id={`send-files-note-${taskId}`} maxLength={1000} />
          <div className={dialogStyles.actions}>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </KeepValuesForm>
      </dialog>
    </div>
  );
}
