'use client';

import { Check, RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { presenceChoiceLabels, presenceLabels, presenceStatuses, type PresenceStatus } from '@/lib/presence/presenceStatus';
import { setPresenceLocally, usePresence } from '@/lib/presence/presenceStore';
import { setMyStatusAction } from '@/server/actions/presenceActions';
import dotStyles from './PresenceDot.module.css';
import styles from './StatusMenu.module.css';

// Choosing your availability, as in Teams. Everyone who sees your name sees it.
export function StatusMenu({ employeeId }: { employeeId: string }) {
  const presence = usePresence(employeeId);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const shown = presence?.status ?? 'available';

  function choose(status: PresenceStatus | null) {
    setProblem(null);
    startTransition(async () => {
      const outcome = await setMyStatusAction(status);
      if (outcome.status === 'error') {
        setProblem(outcome.message ?? 'Your status could not be changed.');
        return;
      }
      setPresenceLocally(employeeId, outcome.shown ?? 'available', status);
      setOpen(false);
    });
  }

  return (
    <div className={styles.menu}>
      <button
        type="button"
        className={styles.current}
        aria-expanded={open}
        aria-controls="status-choices"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={dotStyles.dot} data-status={shown} aria-hidden="true" />
        <span className={styles.currentLabel}>{presenceLabels[shown]}</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div id="status-choices" className={styles.choices} role="group" aria-label="Set your status">
          {presenceStatuses.map((status) => (
            <button
              key={status}
              type="button"
              className={styles.choice}
              disabled={isPending}
              aria-pressed={presence?.chosen === status}
              onClick={() => choose(status)}
            >
              <span className={dotStyles.dot} data-status={status} aria-hidden="true" />
              <span>{presenceChoiceLabels[status]}</span>
              {presence?.chosen === status && <Check size={14} aria-hidden="true" className={styles.check} />}
            </button>
          ))}
          <div className={styles.divider} />
          <button type="button" className={styles.choice} disabled={isPending} onClick={() => choose(null)}>
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset status</span>
          </button>
          <p className={styles.hint}>
            {presence?.chosen
              ? 'Reset to show Available or Away from your activity.'
              : 'Set automatically from your activity.'}
            {presence?.chosen === 'do_not_disturb' ? ' Desktop notifications are paused.' : ''}
          </p>
          {problem && <p className={styles.problem}>{problem}</p>}
        </div>
      )}
    </div>
  );
}
