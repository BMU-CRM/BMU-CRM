'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';

type DecisionButtonsProps = {
  id: string;
  // What is being decided, as in "Approve the claim from Asha?".
  subject: string;
  decide: (approve: boolean, note: string) => Promise<ActionResult>;
  approveLabel?: string;
  rejectLabel?: string;
};

// Approve or reject, with a note the person sees. A reason is needed to reject.
export function DecisionButtons({ id, subject, decide, approveLabel = 'Approve', rejectLabel = 'Reject' }: DecisionButtonsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [approve, setApprove] = useState(true);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function open(choice: boolean) {
    setApprove(choice);
    setResult({ status: 'idle' });
    dialogRef.current?.showModal();
  }

  function submit(formData: FormData) {
    const note = String(formData.get('note') ?? '').trim();
    if (!approve && !note) {
      setResult({ status: 'error', message: 'Please give a reason.' });
      return;
    }
    startTransition(async () => {
      const outcome = await decide(approve, note);
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => open(true)}>
        {approveLabel}
      </Button>
      <Button variant="danger" onClick={() => open(false)}>
        {rejectLabel}
      </Button>
      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-labelledby={`decision-${id}`}>
        <h2 id={`decision-${id}`} className={dialogStyles.title}>
          {approve ? approveLabel : rejectLabel} {subject}?
        </h2>
        <form action={submit} onReset={(event) => event.preventDefault()}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <TextAreaField label={approve ? 'Note (optional)' : 'Reason'} name="note" id={`note-${id}`} hint="They will see this." />
          <div className={dialogStyles.actions} style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant={approve ? 'primary' : 'danger'} disabled={isPending}>
              {isPending ? 'Saving…' : approve ? approveLabel : rejectLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
