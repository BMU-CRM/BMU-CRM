import type { ReactNode } from 'react';
import styles from './Panel.module.css';

type PanelProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  flush?: boolean;
  children: ReactNode;
};

export function Panel({ title, description, action, flush = false, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      {title && (
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? undefined : styles.body}>{children}</div>
    </section>
  );
}
