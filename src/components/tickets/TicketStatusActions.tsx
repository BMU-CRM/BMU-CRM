'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import type { TicketStatus } from '@/lib/validation/ticketSchema';
import { changeTicketStatusAction } from '@/server/actions/ticketActions';

export type TicketMove = { status: TicketStatus; label: string; variant: 'primary' | 'secondary' | 'ghost' };

type TicketStatusActionsProps = {
  ticketId: string;
  moves: TicketMove[];
  canResolve: boolean;
};

// The workflow buttons for a ticket. Resolving asks for what was done, because the
// requester sees it and the database requires it.
export function TicketStatusActions({ ticketId, moves, canResolve }: TicketStatusActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [dialogResult, setDialogResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function move(status: TicketStatus) {
    startTransition(async () => setResult(await changeTicketStatusAction(ticketId, status)));
  }

  function resolve(formData: FormData) {
    startTransition(async () => {
      const outcome = await changeTicketStatusAction(ticketId, 'resolved', String(formData.get('resolution') ?? ''));
      setDialogResult(outcome);
      if (outcome.status === 'success') {
        dialogRef.current?.close();
        setResult(outcome);
      }
    });
  }

  if (moves.length === 0 && !canResolve) return null;

  return (
    <>
      {result.status === 'error' && <FormMessage result={result} />}
      {moves.map((option) => (
        <Button key={option.status} variant={option.variant} disabled={isPending} onClick={() => move(option.status)}>
          {option.label}
        </Button>
      ))}
      {canResolve && (
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() => {
            setDialogResult({ status: 'idle' });
            dialogRef.current?.showModal();
          }}
        >
          Resolve
        </Button>
      )}
      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-labelledby={`resolve-${ticketId}`}>
        <h2 id={`resolve-${ticketId}`} className={dialogStyles.title}>
          Resolve this ticket?
        </h2>
        <form action={resolve} onReset={(event) => event.preventDefault()}>
          <FormMessage result={dialogResult.status === 'error' ? dialogResult : { status: 'idle' }} />
          <TextAreaField
            label="What was done"
            name="resolution"
            id={`resolution-${ticketId}`}
            rows={4}
            required
            hint="The person who raised it will see this, and can reopen the ticket if it is not fixed."
          />
          <div className={dialogStyles.actions} style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? 'Saving…' : 'Resolve'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
