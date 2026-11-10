import styles from './ProgressBar.module.css';

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const percentage = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.wrapper}>
      <span
        className={styles.track}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <span className={styles.bar} style={{ width: `${percentage}%` }} />
      </span>
      <span className={styles.value}>{percentage}%</span>
    </div>
  );
}
