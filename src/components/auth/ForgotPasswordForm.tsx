'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { TextField } from '@/components/ui/FormFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { requestPasswordResetAction } from '@/server/actions/authActions';
import styles from './AuthForms.module.css';

export function ForgotPasswordForm() {
  const [result, formAction] = useActionState(requestPasswordResetAction, idleResult);

  return (
    <>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.description}>We will email you a link to choose a new password.</p>
      <FormMessage result={result} />
      <KeepValuesForm action={formAction} className={styles.form}>
        <TextField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={result.fieldErrors?.email}
        />
        <SubmitButton label="Send reset link" pendingLabel="Sending…" className={styles.submit} />
      </KeepValuesForm>
      <Link href="/login" className={styles.link}>
        Back to sign in
      </Link>
    </>
  );
}
