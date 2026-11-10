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
import { formatWorkedTime, indiaClock } from '@/lib/attendance/summariseAttendance';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getTodayAttendance, listAttendanceRecords } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Attendance' };

const sourceLabels: Record<string, string> = { web: 'Checked in here', manual: 'Corrected by HR', import: 'Imported' };

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
        description="Times are in Indian time."
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
                    <th scope="col">Worked</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.work_date)}</td>
                      <td>{record.check_in_at ? indiaClock(record.check_in_at) : '—'}</td>
                      <td>{record.check_out_at ? indiaClock(record.check_out_at) : '—'}</td>
                      <td>
                        {record.check_in_at && record.check_out_at
                          ? formatWorkedTime(
                              Math.round((new Date(record.check_out_at).getTime() - new Date(record.check_in_at).getTime()) / 60000),
                            )
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge>{sourceLabels[record.source] ?? record.source}</StatusBadge>
                        {record.note && <p className={tableStyles.secondaryText}>{record.note}</p>}
                      </td>
                    </tr>
                  ))}
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
