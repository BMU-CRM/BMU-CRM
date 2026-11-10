import { LogIn, LogOut } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatWorkedTime, indiaClock } from '@/lib/attendance/summariseAttendance';
import { checkInAction, checkOutAction } from '@/server/actions/hrActions';
import styles from './AttendanceTodayPanel.module.css';

type AttendanceTodayPanelProps = {
  record: { check_in_at: string | null; check_out_at: string | null } | null;
};

export function AttendanceTodayPanel({ record }: AttendanceTodayPanelProps) {
  const checkedIn = record?.check_in_at ?? null;
  const checkedOut = record?.check_out_at ?? null;
  const worked =
    checkedIn && checkedOut
      ? formatWorkedTime(Math.round((new Date(checkedOut).getTime() - new Date(checkedIn).getTime()) / 60000))
      : null;

  return (
    <Panel title="Today">
      <dl className={styles.times}>
        <div>
          <dt>Checked in</dt>
          <dd>{checkedIn ? indiaClock(checkedIn) : '—'}</dd>
        </div>
        <div>
          <dt>Checked out</dt>
          <dd>{checkedOut ? indiaClock(checkedOut) : '—'}</dd>
        </div>
        <div>
          <dt>Worked</dt>
          <dd>{worked ?? '—'}</dd>
        </div>
      </dl>
      <div className={layout.spaced}>
        {!checkedIn && (
          <span className={styles.action}>
            <LogIn size={16} aria-hidden="true" />
            <ActionButton label="Check in" variant="primary" action={checkInAction} />
          </span>
        )}
        {checkedIn && !checkedOut && (
          <span className={styles.action}>
            <LogOut size={16} aria-hidden="true" />
            <ActionButton label="Check out" variant="secondary" action={checkOutAction} />
          </span>
        )}
        {checkedOut && <p className={layout.muted}>You have finished for today.</p>}
      </div>
    </Panel>
  );
}
