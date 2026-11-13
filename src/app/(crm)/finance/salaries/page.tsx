import { Download, HandCoins } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { ReimbursementStatusBadge } from '@/components/reimbursements/ReimbursementStatusBadge';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getClaimTotals,
  listClaimsForFinance,
  listPaidRuns,
  listRunsForFinance,
  reimbursementsPerPage,
} from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'Salaries and reimbursements' };

type SalariesPageProps = { searchParams: Promise<Record<string, string | undefined>> };

const claimViews = [
  { value: 'approved', label: 'To pay' },
  { value: 'paid', label: 'Paid' },
  { value: 'submitted', label: 'Waiting for approval' },
] as const;

// Finance's side of salaries and reimbursements: what is waiting, what to pay and what
// was paid. Paying either files the expense automatically.
export default async function SalariesPage({ searchParams }: SalariesPageProps) {
  const access = await requirePagePermission(permissionKeys.reimbursementsPay);
  const params = await searchParams;
  const view = params.view === 'reimbursements' ? 'reimbursements' : 'salaries';

  return (
    <>
      <PageHeader
        title="Salaries and reimbursements"
        description="Payroll runs to approve and pay, and approved claims to pay. Each payment is filed as an expense automatically."
        actions={
          <ButtonLink href={`/finance/salaries/export?${new URLSearchParams(cleanParams({ ...params, view }))}`} prefetch={false}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </ButtonLink>
        }
      />
      <PageTabs
        label="Salaries and reimbursements"
        tabs={[
          { href: '/finance/salaries', label: 'Salaries', current: view === 'salaries' },
          { href: '/finance/salaries?view=reimbursements', label: 'Reimbursements', current: view === 'reimbursements' },
        ]}
      />
      {view === 'salaries' ? (
        <SalariesView year={params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : Number(todayInIndia().slice(0, 4))} canApprove={access.permissions[permissionKeys.payrollApprove] !== undefined} />
      ) : (
        <ReimbursementsView params={params} />
      )}
    </>
  );
}

function cleanParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== 'page'));
}

async function SalariesView({ year, canApprove }: { year: number; canApprove: boolean }) {
  const [open, paid] = await Promise.all([listRunsForFinance(), listPaidRuns(year)]);
  const paidTotal = paid.reduce((sum, run) => sum + Number(run.total_net), 0);

  return (
    <div className={layout.stack}>
      <Panel title="Waiting on Finance" description="Runs sent for approval, and approved runs to pay." flush>
        {open.length === 0 ? (
          <p className={layout.emptyText}>Nothing waiting.</p>
        ) : (
          <ul className={layout.list}>
            {open.map((run) => (
              <li key={run.id} className={layout.row}>
                <div className={layout.rowMain}>
                  <p>
                    <Link href={`/hr/payroll/${run.id}`} className={layout.rowTitle}>
                      {formatPayrollMonth(run.month)}
                    </Link>{' '}
                    <span className={layout.muted}>
                      {run.employee_count} people · {formatRupees(run.total_net)} net
                    </span>
                  </p>
                </div>
                <StatusBadge tone="warning">{run.status === 'in_review' ? 'Waiting for approval' : 'Approved, to pay'}</StatusBadge>
                {canApprove && (
                  <ButtonLink href={run.status === 'in_review' ? `/hr/payroll/${run.id}/review` : `/hr/payroll/${run.id}/pay`} variant={run.status === 'approved' ? 'primary' : 'secondary'}>
                    {run.status === 'in_review' ? 'Review' : 'Pay'}
                  </ButtonLink>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <form method="get" className={filterStyles.filters}>
        <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
        <div className={filterStyles.actions}>
          <Button type="submit">Show</Button>
        </div>
      </form>
      <StatTiles
        tiles={[
          { label: `Salaries paid in ${year}`, value: formatRupees(paidTotal) },
          { label: 'Months paid', value: paid.length },
        ]}
      />
      <Panel title={`Paid in ${year}`} flush>
        {paid.length === 0 ? (
          <EmptyState icon={HandCoins} title="No salaries paid this year" description="Paid payroll runs appear here by month." />
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Paid</th>
                  <th scope="col" className={tableStyles.numeric}>People</th>
                  <th scope="col" className={tableStyles.numeric}>Gross</th>
                  <th scope="col" className={tableStyles.numeric}>Deductions</th>
                  <th scope="col" className={tableStyles.numeric}>Net paid</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/hr/payroll/${run.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                        {formatPayrollMonth(run.month)}
                      </Link>
                    </td>
                    <td>
                      <p>{run.paid_on ? formatDate(run.paid_on) : '—'}</p>
                      <p className={tableStyles.secondaryText}>
                        {[run.payment_method ? paymentMethodLabels[run.payment_method] : null, run.payment_reference].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className={tableStyles.numeric}>{run.employee_count}</td>
                    <td className={tableStyles.numeric}>{formatRupees(run.total_gross)}</td>
                    <td className={tableStyles.numeric}>{formatRupees(run.total_deductions)}</td>
                    <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(run.total_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

async function ReimbursementsView({ params }: { params: Record<string, string | undefined> }) {
  const status = claimViews.find((option) => option.value === params.status)?.value ?? 'approved';
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined;
  const page = parsePage(params.page);
  const [{ claims, total }, totals] = await Promise.all([listClaimsForFinance({ status, search: params.search, month, page }), getClaimTotals()]);

  function hrefForPage(target: number) {
    return `/finance/salaries?${new URLSearchParams({ ...cleanParams(params), view: 'reimbursements', page: String(target) })}`;
  }

  return (
    <div className={layout.stack}>
      <StatTiles
        tiles={[
          { label: `To pay (${totals.toPay})`, value: formatRupees(totals.toPayAmount) },
          { label: `Waiting for approval (${totals.waiting})`, value: formatRupees(totals.waitingAmount) },
        ]}
      />
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value="reimbursements" />
        <TextField label="Search" name="search" type="search" placeholder="Employee name" defaultValue={params.search} />
        <SelectField label="Show" name="status" options={claimViews.map((option) => ({ value: option.value, label: option.label }))} defaultValue={status} />
        <TextField label="Paid in month" name="month" type="month" defaultValue={month} hint="For paid claims." />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/finance/salaries?view=reimbursements" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {claims.length === 0 ? (
          <EmptyState icon={HandCoins} title="No claims here" description={status === 'approved' ? 'Approved claims waiting to be paid appear here.' : 'Try different filters.'} />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Claim</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={tableStyles.numeric}>Amount</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id}>
                      <td>
                        <p className={tableStyles.primaryText}>{claim.employee?.full_name}</p>
                        <p className={tableStyles.secondaryText}>{claim.employee?.department?.name ?? 'No department'}</p>
                      </td>
                      <td>
                        <Link href={`/reimbursements/${claim.id}`} className={tableStyles.primaryLink}>
                          {claim.category?.name}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {formatDate(claim.expense_date)} · {claim.description}
                        </p>
                      </td>
                      <td>
                        <ReimbursementStatusBadge status={claim.status} />
                        {claim.paid_on && <p className={tableStyles.secondaryText}>Paid {formatDate(claim.paid_on)}</p>}
                      </td>
                      <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(claim.amount)}</td>
                      <td>
                        {claim.status === 'approved' && (
                          <ButtonLink href={`/finance/salaries/reimbursements/${claim.id}/pay`} variant="primary">
                            Pay
                          </ButtonLink>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={reimbursementsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </div>
  );
}
