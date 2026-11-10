'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { TextField } from '@/components/ui/FormFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { setPasswordAction } from '@/server/actions/authActions';
import styles from './AuthForms.module.css';

export function SetPasswordForm() {
  const [result, formAction] = useActionState(setPasswordAction, idleResult);

  return (
    <>
      <h1 className={styles.title}>Set your password</h1>
      <p className={styles.description}>Use at least 10 characters, with a letter and a number.</p>
      <FormMessage result={result} />
      <KeepValuesForm action={formAction} className={styles.form}>
        <TextField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={result.fieldErrors?.password}
        />
        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          error={result.fieldErrors?.confirmPassword}
        />
        <SubmitButton label="Save password" pendingLabel="Saving…" className={styles.submit} />
      </KeepValuesForm>
    </>
  );
}
