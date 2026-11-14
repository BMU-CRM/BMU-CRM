import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  AttendanceEventsTable,
  AttendanceSummaryTable,
  EmployeeDaysTable,
  MonthlyAttendanceGrid,
  WorkingHoursTable,
} from '@/components/hr/AttendanceReportTables';
import { AttendanceBulkCorrectionForm } from '@/components/hr/AttendanceBulkCorrectionForm';
import { AttendanceCorrectionForm, AttendanceImportForm } from '@/components/hr/HrForms';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { PageTabs } from '@/components/ui/PageTabs';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { datesBetween, formatWorkedTime, summariseAttendance, type EmployeeAttendance } from '@/lib/attendance/summariseAttendance';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getAttendanceReportData } from '@/server/services/hrService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Attendance report' };

const views = [
  { key: 'summary', label: 'Summary' },
  { key: 'late', label: 'Late arrivals' },
  { key: 'early', label: 'Early departures' },
  { key: 'hours', label: 'Working hours' },
  { key: 'monthly', label: 'Monthly grid' },
  { key: 'employee', label: 'One employee' },
] as const;
type View = (typeof views)[number]['key'];

const sorts = [
  { value: 'name', label: 'Name' },
  { value: 'late', label: 'Most late' },
  { value: 'absent', label: 'Most absent' },
  { value: 'hours', label: 'Most hours' },
  { value: 'overtime', label: 'Most overtime' },
] as const;
type Sort = (typeof sorts)[number]['value'];

const perPage = 25;

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

function sortRows(rows: EmployeeAttendance[], sort: Sort) {
  const by: Record<Sort, (row: EmployeeAttendance) => number> = {
    name: () => 0,
    late: (row) => row.late,
    absent: (row) => row.absent,
    hours: (row) => row.workedMinutes,
    overtime: (row) => row.overtimeMinutes,
  };
  return [...rows].sort((a, b) => by[sort](b) - by[sort](a) || a.name.localeCompare(b.name));
}

type AttendanceReportPageProps = {
  searchParams: Promise<{ month?: string; view?: string; search?: string; departmentId?: string; sort?: string; employeeId?: string; page?: string }>;
};

export default async function AttendanceReportPage({ searchParams }: AttendanceReportPageProps) {
  const access = await requirePagePermission(permissionKeys.attendanceView);
  const today = todayInIndia();
  const params = await searchParams;
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const view: View = views.some((item) => item.key === params.view) ? (params.view as View) : 'summary';
  const sort: Sort = sorts.some((item) => item.value === params.sort) ? (params.sort as Sort) : 'name';
  const departmentId = parseId(params.departmentId);
  const page = parsePage(params.page);
  const { from, to } = monthBounds(month);

  const [data, departments] = await Promise.all([getAttendanceReportData(from, to), listDepartments()]);
  if (!data) notFound();

  const allRows = summariseAttendance(data, from, to, today);
  const departmentName = departments.find((department) => department.id === departmentId)?.name;
  const term = params.search ? cleanSearchTerm(params.search).toLowerCase() : '';
  const rows = sortRows(
    allRows.filter((row) => (!term || row.name.toLowerCase().includes(term)) && (!departmentName || row.department === departmentName)),
    sort,
  );
  const canManage = access.permissions[permissionKeys.attendanceManage] !== undefined;
  const overtimeIsSet = data.settings.overtime_after_minutes != null;

  const employeeId = parseId(params.employeeId) ?? (view === 'employee' ? rows[0]?.employeeId : undefined);
  const chosen = allRows.find((row) => row.employeeId === employeeId);

  const events =
    view === 'late' || view === 'early'
      ? rows
          .flatMap((row) => row.details.map((day) => ({ row, day })))
          .filter(({ day }) => (view === 'late' ? day.lateMinutes > 0 : day.earlyMinutes > 0))
          .sort((a, b) => b.day.date.localeCompare(a.day.date) || a.row.name.localeCompare(b.row.name))
      : [];
  const listLength = view === 'late' || view === 'early' ? events.length : rows.length;
  const pageStart = (page - 1) * perPage;

  function href(changes: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    const merged = { month, view, search: params.search, departmentId, sort, employeeId: params.employeeId, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
    return `/attendance/report?${query.toString()}`;
  }

  return (
    <>
      <PageHeader title="Attendance report" description="Working days skip week offs and holidays. Late means after the start time plus the grace period. Hours leave out breaks." />
      <div className={layout.stack}>
        <PageTabs
          label="Report views"
          tabs={views.map((item) => ({ href: href({ view: item.key, page: undefined }), label: item.label, current: item.key === view }))}
        />
        <form method="get" className={filterStyles.filters}>
          <input type="hidden" name="view" value={view} />
          <TextField label="Month" name="month" type="month" defaultValue={month} />
          {view === 'employee' ? (
            <SelectField
              label="Employee"
              name="employeeId"
              options={allRows.map((row) => ({ value: row.employeeId, label: row.name }))}
              defaultValue={chosen?.employeeId}
            />
          ) : (
            <>
              <TextField label="Search" name="search" type="search" placeholder="Name" defaultValue={params.search} />
              <SelectField
                label="Department"
                name="departmentId"
                options={departments.map((department) => ({ value: department.id, label: department.name }))}
                placeholder="All departments"
                defaultValue={departmentId}
              />
              {(view === 'summary' || view === 'hours' || view === 'monthly') && (
                <SelectField label="Sort by" name="sort" options={[...sorts]} defaultValue={sort} />
              )}
            </>
          )}
          <div className={filterStyles.actions}>
            <ButtonLink href={`/attendance/report?view=${view}`} variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>

        {view === 'employee' && chosen ? (
          <StatTiles
            tiles={[
              { label: 'Present', value: chosen.present },
              { label: 'Late', value: chosen.late },
              { label: 'Absent', value: chosen.absent },
              { label: 'Hours worked', value: formatWorkedTime(chosen.workedMinutes) },
            ]}
          />
        ) : (
          <StatTiles
            tiles={[
              { label: 'People', value: rows.length },
              { label: 'Late arrivals', value: rows.reduce((sum, row) => sum + row.late, 0) },
              { label: 'Early departures', value: rows.reduce((sum, row) => sum + row.earlyDepartures, 0) },
              { label: 'Days absent', value: rows.reduce((sum, row) => sum + row.absent, 0) },
              { label: 'Days from home', value: rows.reduce((sum, row) => sum + row.wfhDays, 0) },
              {
                label: 'Overtime',
                value: overtimeIsSet ? formatWorkedTime(rows.reduce((sum, row) => sum + row.overtimeMinutes, 0)) : 'Not set up',
              },
            ]}
          />
        )}

        <Panel title={views.find((item) => item.key === view)?.label} description={view === 'employee' ? chosen?.name : undefined} flush>
          {listLength === 0 && view !== 'employee' ? (
            <EmptyState
              icon={CalendarClock}
              title={view === 'late' ? 'No late arrivals' : view === 'early' ? 'No early departures' : 'No matching people'}
              description={term || departmentName ? 'Try different filters.' : 'Nothing to show for this month.'}
            />
          ) : view === 'employee' ? (
            chosen ? <EmployeeDaysTable row={chosen} /> : <p className={layout.emptyText}>Choose an employee.</p>
          ) : (
            <>
              {view === 'summary' && <AttendanceSummaryTable rows={rows.slice(pageStart, pageStart + perPage)} month={month} />}
              {view === 'hours' && <WorkingHoursTable rows={rows.slice(pageStart, pageStart + perPage)} month={month} overtimeIsSet={overtimeIsSet} />}
              {view === 'monthly' && <MonthlyAttendanceGrid rows={rows.slice(pageStart, pageStart + perPage)} dates={datesBetween(from, to)} month={month} />}
              {(view === 'late' || view === 'early') && (
                <AttendanceEventsTable events={events.slice(pageStart, pageStart + perPage)} kind={view} month={month} />
              )}
              <PaginationBar page={page} perPage={perPage} total={listLength} hrefForPage={(target) => href({ page: String(target) })} />
            </>
          )}
        </Panel>

        {canManage && (
          <Panel
            title="Correct several people"
            description="Tick people, or select all, then choose the dates. Only what you fill in changes. Days on approved leave, holidays and week offs are skipped. Recorded in the audit log."
          >
            <AttendanceBulkCorrectionForm people={data.employees.filter((employee) => employee.id !== access.employee.id)} />
          </Panel>
        )}

        {canManage && (
          <div className={layout.columns}>
            <Panel title="Correct a record" description="For a forgotten check-in, a half day or a mistake. Each correction is recorded in the audit log.">
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
