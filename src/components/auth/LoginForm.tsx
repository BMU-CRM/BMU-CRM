'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { TextField } from '@/components/ui/FormFields';
import { PasswordField } from '@/components/ui/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import type { FirebaseConfig } from '@/lib/auth/firebaseConfig';
import { GoogleSignInButton } from './GoogleSignInButton';
import { signInAction } from '@/server/actions/authActions';
import styles from './AuthForms.module.css';

type LoginFormProps = { next?: string; notice?: string; firebase: FirebaseConfig | null };

export function LoginForm({ next, notice, firebase }: LoginFormProps) {
  const [result, formAction] = useActionState(signInAction, idleResult);

  return (
    <>
      <h1 className={styles.title}>Sign in</h1>
      <p className={styles.description}>
        {firebase ? 'Use the Google account you were invited with, or your email and password.' : 'Use your work email and password.'}
      </p>
      {notice && result.status === 'idle' && <FormMessage result={{ status: 'error', message: notice }} />}
      {firebase && (
        <>
          <GoogleSignInButton config={firebase} next={next} />
          <p className={styles.divider}>or</p>
        </>
      )}
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
        <PasswordField
          label="Password"
          name="password"
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
