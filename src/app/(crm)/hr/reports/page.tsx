import { Download, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart } from '@/components/charts/BarChart';
import { LeaveTable, MovementTables, PayrollTable, PeopleTables } from '@/components/hr/HrReportTables';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { Panel } from '@/components/ui/Panel';
import { PeriodFilter } from '@/components/ui/PeriodFilter';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { summariseLeave } from '@/lib/hr/hrReports';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { getPeopleReport } from '@/server/services/hrReportService';
import { getLeaveUtilisation } from '@/server/services/hrService';
import { listPaidRuns } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'HR reports' };

type Params = { view?: string; period?: string; from?: string; to?: string };

// HR's reports in one place: headcount, joinings and leavers, leave and salaries, each
// as a CSV download and a printable page. Attendance has its own detailed report.
export default async function HrReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const access = await requirePagePermission(permissionKeys.hrDashboard);
  const params = await searchParams;
  const seesPayroll = access.permissions[permissionKeys.payrollManage] !== undefined || access.permissions[permissionKeys.payrollApprove] !== undefined;
  const views = ['people', 'movement', 'leave', ...(seesPayroll ? ['payroll'] : [])];
  const view = views.find((value) => value === params.view) ?? 'people';
  const { range, period } = chooseRange(params, todayInIndia(), 'this-year');
  const year = Number(range.to.slice(0, 4));
  const query = new URLSearchParams({ view, ...(period ? { period } : range) }).toString();
  const usesYear = view === 'leave' || view === 'payroll';

  return (
    <>
      <PageHeader
        title="HR reports"
        description={
          usesYear
            ? `Calendar year ${year}, from the period chosen.`
            : `${period ? `${periodLabels[period]}: ` : ''}${formatDate(range.from)} to ${formatDate(range.to)}.`
        }
        actions={
          <>
            <ButtonLink href={`/hr/reports/export?${query}`} prefetch={false}>
              <Download size={16} aria-hidden="true" />
              Export CSV
            </ButtonLink>
            <ButtonLink href={`/hr/reports/print?${query}`}>
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
          </>
        }
      />
      <PageTabs
        label="HR reports"
        tabs={[
          { href: `/hr/reports?view=people`, label: 'Headcount', current: view === 'people' },
          { href: `/hr/reports?view=movement`, label: 'Joinings and leavers', current: view === 'movement' },
          { href: `/hr/reports?view=leave`, label: 'Leave', current: view === 'leave' },
          ...(seesPayroll ? [{ href: `/hr/reports?view=payroll`, label: 'Salaries', current: view === 'payroll' }] : []),
        ]}
      />
      <PeriodFilter basePath={`/hr/reports`} range={range} period={period} hidden={{ view }} />
      <div className={layout.stack}>
        {(view === 'people' || view === 'movement') && <PeopleView view={view} range={range} />}
        {view === 'leave' && <LeaveView year={year} />}
        {view === 'payroll' && <PayrollView year={year} />}
        <Panel title="More reports">
          <ul className={layout.factsStacked}>
            <li>
              <Link href="/attendance/report" className={layout.link}>
                Attendance report
              </Link>
              : late arrivals, early departures, working hours, monthly and by employee.
            </li>
            <li>
              <Link href="/hr/leave/utilisation" className={layout.link}>
                Leave by person
              </Link>
              : each employee&apos;s balance and use.
            </li>
            {access.permissions[permissionKeys.exitsManage] !== undefined && (
              <li>
                <Link href="/hr/exits?view=attrition" className={layout.link}>
                  Attrition
                </Link>
                : leavers and the attrition rate each month.
              </li>
            )}
            <li>
              <Link href="/people/employees/export" className={layout.link} prefetch={false}>
                Employee directory (CSV)
              </Link>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

async function PeopleView({ view, range }: { view: 'people' | 'movement'; range: { from: string; to: string } }) {
  const report = await getPeopleReport(range);
  return (
    <>
      <StatTiles
        tiles={[
          { label: 'Employees now', value: report.headcount },
          { label: 'Joined in the period', value: report.joined },
          { label: 'Left in the period', value: report.left },
          { label: 'Attrition in the period', value: `${report.attritionRate}%` },
        ]}
      />
      {view === 'people' ? (
        <>
          <Panel title="Headcount by department">
            <BarChart label="Employees by department" data={report.byDepartment.map((row) => ({ label: row.name, value: row.count }))} valueHeading="People" />
          </Panel>
          <PeopleTables report={report} />
        </>
      ) : (
        <MovementTables report={report} />
      )}
    </>
  );
}

async function LeaveView({ year }: { year: number }) {
  const rows = summariseLeave(await getLeaveUtilisation(year));
  return (
    <>
      <Panel title={`Approved leave days in ${year}`}>
        <BarChart label={`Approved leave days by type, ${year}`} data={rows.map((row) => ({ label: row.leaveType, value: row.approved }))} valueHeading="Days" />
      </Panel>
      <LeaveTable rows={rows} year={year} />
    </>
  );
}

async function PayrollView({ year }: { year: number }) {
  const runs = [...(await listPaidRuns(year))].reverse();
  return (
    <>
      <Panel title={`Net salaries paid each month, ${year}`}>
        <BarChart
          label={`Net salaries paid each month of ${year}`}
          orientation="vertical"
          data={runs.map((run) => ({ label: formatPayrollMonth(run.month).slice(0, 3), value: Number(run.total_net) }))}
          formatValue={formatRupees}
          valueHeading="Net paid"
        />
      </Panel>
      <PayrollTable rows={runs.map((run) => ({ ...run, total_gross: Number(run.total_gross), total_deductions: Number(run.total_deductions), total_net: Number(run.total_net) }))} year={year} />
    </>
  );
}
