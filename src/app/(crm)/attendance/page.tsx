import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import { AttendanceTodayPanel } from '@/components/hr/AttendanceTodayPanel';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { dayStatusLabels, formatWorkedTime, indiaClock } from '@/lib/attendance/summariseAttendance';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getTodayAttendance, listAttendanceRecords } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Attendance' };

const sourceLabels: Record<string, string> = { web: 'Checked in here', manual: 'Corrected by HR', import: 'Imported' };

function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export default async function AttendancePage() {
  const access = await requirePagePermission(permissionKeys.attendanceView);
  const today = todayInIndia();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [todayRecord, records] = await Promise.all([
    getTodayAttendance(access),
    listAttendanceRecords(access.employee.id, monthStart, today),
  ]);

  const seesOthers = access.permissions[permissionKeys.attendanceView] !== 'own';

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Times are in Indian time. Hours worked leave out breaks."
        actions={seesOthers && <ButtonLink href="/attendance/report">Team report</ButtonLink>}
      />
      <div className={layout.columns}>
        <Panel title="This month" flush>
          {records.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No attendance yet this month" description="Check in to start your record." />
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">In</th>
                    <th scope="col">Out</th>
                    <th scope="col">Breaks</th>
                    <th scope="col">Worked</th>
                    <th scope="col">Where and how</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const breakMinutes = record.breaks
                      .filter((entry) => entry.ended_at)
                      .reduce((total, entry) => total + minutesBetween(entry.started_at, entry.ended_at!), 0);
                    return (
                      <tr key={record.id}>
                        <td>{formatDate(record.work_date)}</td>
                        <td>{record.check_in_at ? indiaClock(record.check_in_at) : '—'}</td>
                        <td>{record.check_out_at ? indiaClock(record.check_out_at) : '—'}</td>
                        <td>{breakMinutes > 0 ? formatWorkedTime(breakMinutes) : '—'}</td>
                        <td>
                          {record.check_in_at && record.check_out_at
                            ? formatWorkedTime(Math.max(0, minutesBetween(record.check_in_at, record.check_out_at) - breakMinutes))
                            : '—'}
                        </td>
                        <td>
                          <div className={layout.badges}>
                            {record.work_mode === 'wfh' && <StatusBadge tone="warning">From home</StatusBadge>}
                            {record.status_override && <StatusBadge>{dayStatusLabels[record.status_override]}</StatusBadge>}
                            <StatusBadge>{sourceLabels[record.source] ?? record.source}</StatusBadge>
                          </div>
                          {record.note && <p className={tableStyles.secondaryText}>{record.note}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <AttendanceTodayPanel record={todayRecord} />
      </div>
    </>
  );
}
