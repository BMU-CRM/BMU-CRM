'use client';

import { useId, useRef, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/actionResult';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import styles from './ConfirmActionButton.module.css';

type ConfirmActionButtonProps = {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
  action: () => Promise<ActionResult>;
};

export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel,
  variant = 'danger',
  action,
}: ConfirmActionButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') dialogRef.current?.close();
    });
  }

  return (
    <>
      <Button variant={variant} onClick={() => dialogRef.current?.showModal()}>
        {label}
      </Button>
      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>
        <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={isPending}>
            Cancel
          </Button>
          <Button variant={variant} onClick={confirm} disabled={isPending}>
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
