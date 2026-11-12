'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { TextField } from '@/components/ui/FormFields';
import { PasswordField } from '@/components/ui/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { createFirstAccountAction } from '@/server/actions/authActions';
import styles from './AuthForms.module.css';

export function FirstAccountForm() {
  const [result, formAction] = useActionState(createFirstAccountAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <>
      <h1 className={styles.title}>Set up your workspace</h1>
      <p className={styles.description}>
        Create the Founder account. You can then invite everyone else from People.
      </p>
      <FormMessage result={result} />
      <KeepValuesForm action={formAction} className={styles.form}>
        <TextField label="Your name" name="fullName" autoComplete="name" required error={errors?.fullName} />
        <TextField label="Work email" name="email" type="email" autoComplete="email" required error={errors?.email} />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          hint="At least 10 characters, with a letter and a number."
          required
          error={errors?.password}
        />
        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          error={errors?.confirmPassword}
        />
        <SubmitButton label="Create account" pendingLabel="Creating…" className={styles.submit} />
      </KeepValuesForm>
    </>
  );
}
