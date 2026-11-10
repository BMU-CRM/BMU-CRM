'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { cancelInvoiceAction } from '@/server/actions/invoiceActions';

// Cancelling asks why, because the reason is kept with the invoice for the accounts.
export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function cancel(formData: FormData) {
    startTransition(async () => {
      const outcome = await cancelInvoiceAction(invoiceId, String(formData.get('cancelReason') ?? ''));
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setResult({ status: 'idle' });
          dialogRef.current?.showModal();
        }}
      >
        Cancel invoice
      </Button>
      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-labelledby={`cancel-${invoiceId}`}>
        <h2 id={`cancel-${invoiceId}`} className={dialogStyles.title}>
          Cancel this invoice?
        </h2>
        <p className={dialogStyles.description}>
          Its number stays used and it stays on record, marked as cancelled. Issue a new invoice if the client still needs one.
        </p>
        <form action={cancel} onReset={(event) => event.preventDefault()}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <TextAreaField label="Reason" name="cancelReason" id={`cancel-reason-${invoiceId}`} rows={3} required />
          <div className={dialogStyles.actions} style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
              Keep invoice
            </Button>
            <Button type="submit" variant="danger" disabled={isPending}>
              {isPending ? 'Cancelling…' : 'Cancel invoice'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
