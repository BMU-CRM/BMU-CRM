'use client';

import { useActionState, useRef, type ReactNode } from 'react';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { FormMessage } from './FormMessage';
import { SubmitButton } from './SubmitButton';
import layout from './WorkspaceLayout.module.css';

type InlineActionFormProps = {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
};

// A small form for adding something to a panel. Fields come in as children, so any
// field error is shown in the message above them. It clears after a successful add,
// and keeps what was typed after an error.
export function InlineActionForm({ action, submitLabel, children }: InlineActionFormProps) {
  const lastStatus = useRef<ActionResult['status']>('idle');

  const [result, formAction] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const outcome = await action(previous, formData);
    lastStatus.current = outcome.status;
    return outcome;
  }, idleResult);

  const firstFieldError = Object.values(result.fieldErrors ?? {})[0];
  const shown = firstFieldError ? { ...result, message: firstFieldError } : result;

  return (
    <form
      action={formAction}
      onReset={(event) => {
        if (lastStatus.current === 'error') event.preventDefault();
      }}
    >
      <FormMessage result={shown} />
      <div className={layout.fieldRow}>
        {children}
        <SubmitButton label={submitLabel} pendingLabel="Saving…" variant="secondary" />
      </div>
    </form>
  );
}
