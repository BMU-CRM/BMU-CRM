import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/finance/PrintButton';
import { LeaveTable, MovementTables, PayrollTable, PeopleTables } from '@/components/hr/HrReportTables';
import styles from '@/components/payroll/PayslipPrint.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange } from '@/lib/finance/financialPeriods';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { summariseLeave } from '@/lib/hr/hrReports';
import { requirePagePermission } from '@/server/services/accessService';
import { getPeopleReport } from '@/server/services/hrReportService';
import { getLeaveUtilisation } from '@/server/services/hrService';
import { getCompanyProfile } from '@/server/services/payrollService';
import { listPaidRuns } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'HR report' };

const titles: Record<string, string> = { people: 'Headcount', movement: 'Joinings and leavers', leave: 'Leave', payroll: 'Salaries paid' };

export default async function HrReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await requirePagePermission(permissionKeys.hrDashboard);
  const params = await searchParams;
  const view = Object.keys(titles).find((value) => value === params.view) ?? 'people';
  const seesPayroll = access.permissions[permissionKeys.payrollManage] !== undefined || access.permissions[permissionKeys.payrollApprove] !== undefined;
  if (view === 'payroll' && !seesPayroll) notFound();
  const today = todayInIndia();
  const { range, period } = chooseRange(params, today, 'this-year');
  const year = Number(range.to.slice(0, 4));
  const company = await getCompanyProfile();
  const back = `/hr/reports?${new URLSearchParams({ view, ...(period ? { period } : range) })}`;

  let content;
  if (view === 'leave') {
    content = <LeaveTable rows={summariseLeave(await getLeaveUtilisation(year))} year={year} />;
  } else if (view === 'payroll') {
    const runs = [...(await listPaidRuns(year))].reverse();
    content = <PayrollTable rows={runs.map((run) => ({ ...run, total_gross: Number(run.total_gross), total_deductions: Number(run.total_deductions), total_net: Number(run.total_net) }))} year={year} />;
  } else {
    const report = await getPeopleReport(range);
    content = (
      <>
        <p>
          {report.headcount} employees now. {report.joined} joined and {report.left} left in the period; attrition {report.attritionRate}%.
        </p>
        {view === 'people' ? <PeopleTables report={report} /> : <MovementTables report={report} />}
      </>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={back}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <p className={styles.company}>{company?.legal_name ?? 'Company name not set'}</p>
          </div>
          <div className={styles.title}>
            <h1>{titles[view]}</h1>
            <p>{view === 'leave' || view === 'payroll' ? `Year ${year}` : `${formatDate(range.from)} to ${formatDate(range.to)}`}</p>
          </div>
        </header>
        {content}
        <p className={styles.footer}>Prepared {formatDate(today)}.</p>
      </article>
    </div>
  );
}
