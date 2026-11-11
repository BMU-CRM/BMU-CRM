import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import styles from './AuthLayout.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <BrandLogo variant="full" className={styles.brandMark} />
          <span className={styles.brandName}>BMU Workspace</span>
        </div>
        {children}
      </div>
    </main>
  );
}
