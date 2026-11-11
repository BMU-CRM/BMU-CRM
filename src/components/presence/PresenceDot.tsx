'use client';

import { presenceLabels } from '@/lib/presence/presenceStatus';
import { usePresence } from '@/lib/presence/presenceStore';
import styles from './PresenceDot.module.css';

type PresenceDotProps = {
  employeeId: string | null | undefined;
  // "overlay" sits on the corner of an avatar; "inline" sits before text.
  variant?: 'overlay' | 'inline';
  // Also writes the status out, such as "Busy".
  withLabel?: boolean;
  // Text shown before it, such as " · ", only once the status is known.
  prefix?: string;
};

// A colleague's availability, as a coloured mark. Nothing shows until it is known.
export function PresenceDot({ employeeId, variant = 'inline', withLabel = false, prefix }: PresenceDotProps) {
  const presence = usePresence(employeeId);
  if (!presence) return null;

  const label = presenceLabels[presence.status];
  return (
    <span className={styles.wrapper} data-variant={variant}>
      {prefix}
      <span className={styles.dot} data-status={presence.status} role="img" aria-label={label} title={label} />
      {withLabel && <span className={styles.label}>{label}</span>}
    </span>
  );
}
