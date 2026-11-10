import type { Metadata } from 'next';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { signOutAction } from '@/server/actions/authActions';
import styles from '@/components/auth/AuthForms.module.css';

export const metadata: Metadata = { title: 'Account inactive' };

export default function AccountInactivePage() {
  return (
    <>
      <h1 className={styles.title}>Your account is not active</h1>
      <p className={styles.description}>Please contact your administrator to restore access.</p>
      <form action={signOutAction}>
        <SubmitButton label="Sign out" pendingLabel="Signing out…" variant="secondary" className={styles.submit} />
      </form>
    </>
  );
}
