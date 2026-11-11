import { Coffee, Home, LogIn, LogOut } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatWorkedTime, indiaClock } from '@/lib/attendance/summariseAttendance';
import { checkInAction, checkOutAction, endBreakAction, startBreakAction } from '@/server/actions/hrActions';
import type { TodayAttendance } from '@/server/services/hrService';
import styles from './AttendanceTodayPanel.module.css';

type AttendanceTodayPanelProps = {
  record: TodayAttendance;
};

export function AttendanceTodayPanel({ record }: AttendanceTodayPanelProps) {
  const checkedIn = record?.check_in_at ?? null;
  const checkedOut = record?.check_out_at ?? null;
  const onBreak = record?.breakStartedAt ?? null;
  const breakMinutes = record?.breakMinutes ?? 0;
  const worked =
    checkedIn && checkedOut
      ? formatWorkedTime(
          Math.max(0, Math.round((new Date(checkedOut).getTime() - new Date(checkedIn).getTime()) / 60000) - breakMinutes),
        )
      : null;

  return (
    <Panel
      title="Today"
      action={checkedIn && <StatusBadge tone={record?.work_mode === 'wfh' ? 'warning' : 'neutral'}>{record?.work_mode === 'wfh' ? 'Working from home' : 'In the office'}</StatusBadge>}
    >
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
          <dt>Breaks</dt>
          <dd>{onBreak ? `On a break since ${indiaClock(onBreak)}` : breakMinutes > 0 ? formatWorkedTime(breakMinutes) : '—'}</dd>
        </div>
        <div>
          <dt>Worked</dt>
          <dd>{worked ?? '—'}</dd>
        </div>
      </dl>
      <div className={`${layout.spaced} ${styles.buttons}`}>
        {!checkedIn && (
          <>
            <span className={styles.action}>
              <LogIn size={16} aria-hidden="true" />
              <ActionButton label="Check in at the office" variant="primary" action={checkInAction.bind(null, 'office')} />
            </span>
            <span className={styles.action}>
              <Home size={16} aria-hidden="true" />
              <ActionButton label="Check in from home" variant="secondary" action={checkInAction.bind(null, 'wfh')} />
            </span>
          </>
        )}
        {checkedIn && !checkedOut && (
          <>
            <span className={styles.action}>
              <Coffee size={16} aria-hidden="true" />
              {onBreak ? (
                <ActionButton label="End break" variant="primary" action={endBreakAction} />
              ) : (
                <ActionButton label="Start a break" variant="secondary" action={startBreakAction} />
              )}
            </span>
            <span className={styles.action}>
              <LogOut size={16} aria-hidden="true" />
              <ActionButton label="Check out" variant="secondary" action={checkOutAction} />
            </span>
          </>
        )}
        {checkedOut && <p className={layout.muted}>You have finished for today.</p>}
      </div>
    </Panel>
  );
}
