'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { TextField } from '@/components/ui/FormFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { signInAction } from '@/server/actions/authActions';
import styles from './AuthForms.module.css';

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [result, formAction] = useActionState(signInAction, idleResult);

  return (
    <>
      <h1 className={styles.title}>Sign in</h1>
      <p className={styles.description}>Use your work email and password.</p>
      {notice && result.status === 'idle' && <FormMessage result={{ status: 'error', message: notice }} />}
      <FormMessage result={result} />
      <KeepValuesForm action={formAction} className={styles.form}>
        {next && <input type="hidden" name="next" value={next} />}
        <TextField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={result.fieldErrors?.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={result.fieldErrors?.password}
        />
        <SubmitButton label="Sign in" pendingLabel="Signing in…" className={styles.submit} />
      </KeepValuesForm>
      <Link href="/forgot-password" className={styles.link}>
        Forgot your password?
      </Link>
    </>
  );
}
