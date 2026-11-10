import type { ReactNode } from 'react';
import styles from './StatusBadge.module.css';

type StatusBadgeProps = {
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
  children: ReactNode;
};

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
