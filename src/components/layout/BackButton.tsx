'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { isMainPage } from '@/lib/access/navigationRegistry';
import styles from './AppTopbar.module.css';

// In place of breadcrumbs: on any page below a main menu page, one button back to where
// the person came from, or to the overview when they opened the page directly.
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (isMainPage(pathname)) return null;

  return (
    <button
      type="button"
      className={styles.backButton}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/overview');
      }}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </button>
  );
}
