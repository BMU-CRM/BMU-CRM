import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AttendanceCorrectionForm, AttendanceImportForm } from '@/components/hr/HrForms';
import { Button } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatWorkedTime, summariseAttendance } from '@/lib/attendance/summariseAttendance';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getAttendanceReportData } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Attendance report' };

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

type AttendanceReportPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function AttendanceReportPage({ searchParams }: AttendanceReportPageProps) {
  const access = await requirePagePermission(permissionKeys.attendanceView);
  const today = todayInIndia();
  const requested = (await searchParams).month;
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : today.slice(0, 7);
  const { from, to } = monthBounds(month);

  const data = await getAttendanceReportData(from, to);
  if (!data) notFound();

  const rows = summariseAttendance(data, from, to, today);
  const canManage = access.permissions[permissionKeys.attendanceManage] !== undefined;

  return (
    <>
      <PageHeader title="Attendance report" description="Working days skip weekends and holidays. Late means after the start time plus the grace period." />
      <div className={layout.stack}>
        <form method="get" className={filterStyles.filters}>
          <TextField label="Month" name="month" type="month" defaultValue={month} />
          <div className={filterStyles.actions}>
            <Button type="submit">Show</Button>
          </div>
        </form>
        <StatTiles
          tiles={[
            { label: 'People', value: rows.length },
            { label: 'Late arrivals', value: rows.reduce((sum, row) => sum + row.late, 0) },
            { label: 'Early departures', value: rows.reduce((sum, row) => sum + row.earlyDepartures, 0) },
            { label: 'Days absent', value: rows.reduce((sum, row) => sum + row.absent, 0) },
          ]}
        />
        <Panel title="By person" flush>
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col" className={tableStyles.numeric}>Working days</th>
                  <th scope="col" className={tableStyles.numeric}>Present</th>
                  <th scope="col" className={tableStyles.numeric}>Late</th>
                  <th scope="col" className={tableStyles.numeric}>Left early</th>
                  <th scope="col" className={tableStyles.numeric}>On leave</th>
                  <th scope="col" className={tableStyles.numeric}>Absent</th>
                  <th scope="col" className={tableStyles.numeric}>Hours worked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td>
                      <p className={tableStyles.primaryText}>{row.name}</p>
                      <p className={tableStyles.secondaryText}>{row.department ?? 'No department'}</p>
                    </td>
                    <td className={tableStyles.numeric}>{row.workingDays}</td>
                    <td className={tableStyles.numeric}>{row.present}</td>
                    <td className={tableStyles.numeric}>{row.late}</td>
                    <td className={tableStyles.numeric}>{row.earlyDepartures}</td>
                    <td className={tableStyles.numeric}>{row.leaveDays}</td>
                    <td className={tableStyles.numeric}>{row.absent}</td>
                    <td className={tableStyles.numeric}>{formatWorkedTime(row.workedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {canManage && (
          <div className={layout.columns}>
            <Panel title="Correct a record" description="For a forgotten check-in or a mistake. Each correction is recorded in the audit log.">
              <AttendanceCorrectionForm
                employees={data.employees
                  .filter((employee) => employee.id !== access.employee.id)
                  .map((employee) => ({ value: employee.id, label: employee.name }))}
              />
            </Panel>
            <Panel title="Import from a file" description="Corrections are never overwritten by an import.">
              <AttendanceImportForm />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
