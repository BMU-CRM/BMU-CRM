import { Banknote, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PayrollStatusBadge, PayrollTabs } from '@/components/payroll/PayrollTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { todayInIndia } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { formatPayrollMonth, previousMonth } from '@/lib/payroll/payrollMonth';
import { payrollRunStatusLabels } from '@/lib/validation/payrollSchema';
import { startPayrollRunAction } from '@/server/actions/payrollActions';
import { requireAccess } from '@/server/services/accessService';
import { getPayrollSetupProblems, listPayrollRuns, payrollRunsPerPage } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Payroll' };

type PayrollPageProps = {
  searchParams: Promise<{ status?: string; year?: string; page?: string }>;
};

export default async function PayrollPage({ searchParams }: PayrollPageProps) {
  const access = await requireAccess();
  const canManage = access.permissions[permissionKeys.payrollManage] !== undefined;
  const canApprove = access.permissions[permissionKeys.payrollApprove] !== undefined;
  if (!canManage && !canApprove) notFound();

  const params = await searchParams;
  const status = Object.keys(payrollRunStatusLabels).find((key) => key === params.status);
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  const page = parsePage(params.page);
  const today = todayInIndia();

  const [{ runs, total }, problems] = await Promise.all([
    listPayrollRuns({ status, year, page }),
    canManage ? getPayrollSetupProblems() : Promise.resolve([]),
  ]);

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (year) query.set('year', String(year));
    query.set('page', String(target));
    return `/hr/payroll?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        description={canManage ? 'HR prepares each month’s payroll; Finance approves it and marks it paid.' : 'Payroll runs prepared by HR, for your approval and payment.'}
      />
      {canManage && <PayrollTabs current="runs" />}
      <div className={layout.stack}>
        {problems.length > 0 && (
          <Panel
            title="Payroll is not fully set up"
            description="Deductions that are not set up are left out of payslips until they are."
            action={<ButtonLink href="/settings/hr/payroll">Open payroll settings</ButtonLink>}
          >
            <ul className={layout.factsStacked}>
              {problems.map((problem) => (
                <li key={problem} className={layout.badges}>
                  <TriangleAlert size={16} aria-hidden="true" />
                  {problem}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {canManage && (
          <Panel title="Start a payroll run" description="Everyone active with a salary structure is added. Paid days come from attendance and leave.">
            <InlineActionForm action={startPayrollRunAction} submitLabel="Start payroll">
              <TextField label="Month" name="month" type="month" defaultValue={previousMonth(today)} required />
            </InlineActionForm>
          </Panel>
        )}
        <form method="get" className={filterStyles.filters}>
          <SelectField
            label="Status"
            name="status"
            options={Object.entries(payrollRunStatusLabels).map(([value, label]) => ({ value, label }))}
            placeholder="Any status"
            defaultValue={status}
          />
          <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
          <div className={filterStyles.actions}>
            <Button type="submit">Apply</Button>
            <ButtonLink href="/hr/payroll" variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <Panel flush>
          {runs.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={status || year ? 'No matching payroll runs' : 'No payroll runs yet'}
              description={canManage ? 'Start the first one above.' : 'Runs appear here once HR prepares them.'}
            />
          ) : (
            <>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={tableStyles.numeric}>People</th>
                      <th scope="col" className={tableStyles.numeric}>Gross</th>
                      <th scope="col" className={tableStyles.numeric}>Net pay</th>
                      <th scope="col" className={tableStyles.numeric}>Cost to company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <Link href={`/hr/payroll/${run.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {formatPayrollMonth(run.month)}
                          </Link>
                          <p className={tableStyles.secondaryText}>Prepared by {run.preparer?.full_name ?? 'someone who has left'}</p>
                        </td>
                        <td>
                          <PayrollStatusBadge status={run.status} />
                        </td>
                        <td className={tableStyles.numeric}>{run.employee_count}</td>
                        <td className={tableStyles.numeric}>{formatRupees(run.total_gross)}</td>
                        <td className={tableStyles.numeric}>{formatRupees(run.total_net)}</td>
                        <td className={tableStyles.numeric}>{formatRupees(run.total_employer_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar page={page} perPage={payrollRunsPerPage} total={total} hrefForPage={hrefForPage} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
