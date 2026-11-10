import styles from './LoadingPanel.module.css';

export function LoadingPanel({ height = 240 }: { height?: number }) {
  return <div className={styles.loading} style={{ height }} role="status" aria-label="Loading" />;
}
