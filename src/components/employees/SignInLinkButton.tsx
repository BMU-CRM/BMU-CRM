'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { createSignInLinkAction } from '@/server/actions/employeeActions';

type SignInLinkButtonProps = {
  employeeId: string;
  employeeName: string;
  kind: 'invite' | 'recovery';
};

// Email is not connected yet, so an administrator creates the link here and sends it
// to the person themselves. Creating a new link stops the older one working.
export function SignInLinkButton({ employeeId, employeeName, kind }: SignInLinkButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const label = kind === 'invite' ? 'Invitation link' : 'Password reset link';
  const lifetime = kind === 'invite' ? '7 days' : '1 hour';

  function open() {
    setLink(null);
    setError(null);
    setCopied(false);
    dialogRef.current?.showModal();
  }

  function create() {
    startTransition(async () => {
      const result = await createSignInLinkAction(employeeId);
      if (result.status === 'success') setLink(result.link);
      else setError(result.message);
    });
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={open}>
        {label}
      </Button>
      <dialog ref={dialogRef} className={dialogStyles.dialog} aria-labelledby={`sign-in-link-${employeeId}`}>
        <h2 id={`sign-in-link-${employeeId}`} className={dialogStyles.title}>
          {label} for {employeeName}
        </h2>
        {error && <FormMessage result={{ status: 'error', message: error }} />}
        {link ? (
          <>
            <p className={dialogStyles.description}>
              Send this link to {employeeName}. It works once and expires in {lifetime}.
            </p>
            <input
              className={formStyles.control}
              value={link}
              readOnly
              aria-label={label}
              onFocus={(event) => event.currentTarget.select()}
            />
          </>
        ) : (
          <p className={dialogStyles.description}>
            Email is not connected yet, so create a link here and send it to {employeeName} yourself, for example in
            chat. Any older link stops working.
          </p>
        )}
        <div className={dialogStyles.actions} style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
          {link ? (
            <Button variant="primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          ) : (
            <Button variant="primary" onClick={create} disabled={isPending}>
              {isPending ? 'Creating…' : 'Create link'}
            </Button>
          )}
        </div>
      </dialog>
    </>
  );
}
