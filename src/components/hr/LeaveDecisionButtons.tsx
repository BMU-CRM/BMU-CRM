'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { decideLeaveAction } from '@/server/actions/hrActions';

export function LeaveDecisionButtons({ requestId, employeeName }: { requestId: string; employeeName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function open(choice: 'approved' | 'rejected') {
    setDecision(choice);
    setResult({ status: 'idle' });
    dialogRef.current?.showModal();
  }

  function submit(formData: FormData) {
    const note = String(formData.get('note') ?? '').trim();
    if (decision === 'rejected' && !note) {
      setResult({ status: 'error', message: 'Please give a reason for rejecting.' });
      return;
    }
    startTransition(async () => {
      const outcome = await decideLeaveAction(requestId, decision, note);
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => open('approved')}>
        Approve
      </Button>
      <Button variant="danger" onClick={() => open('rejected')}>
        Reject
      </Button>
      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-labelledby={`decision-${requestId}`}>
        <h2 id={`decision-${requestId}`} className={dialogStyles.title}>
          {decision === 'approved' ? 'Approve' : 'Reject'} leave for {employeeName}?
        </h2>
        <form action={submit} onReset={(event) => event.preventDefault()}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <TextAreaField
            label={decision === 'rejected' ? 'Reason' : 'Note (optional)'}
            name="note"
            id={`note-${requestId}`}
            hint="They will see this."
          />
          <div className={dialogStyles.actions} style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant={decision === 'approved' ? 'primary' : 'danger'} disabled={isPending}>
              {isPending ? 'Saving…' : decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
