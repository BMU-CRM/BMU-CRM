import type { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Workspace</span>
        </div>
        {children}
      </div>
    </main>
  );
}
