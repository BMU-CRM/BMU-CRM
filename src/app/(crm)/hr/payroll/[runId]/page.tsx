import { Download, Printer, TriangleAlert, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PayrollStatusBadge } from '@/components/payroll/PayrollTabs';
import { ActionButton } from '@/components/ui/ActionButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { discardPayrollRunAction, recalculatePayrollRunAction, submitPayrollRunAction } from '@/server/actions/payrollActions';
import { requireAccess } from '@/server/services/accessService';
import { getPayrollRun, listPayrollLines, payrollLinesPerPage, type PayrollLineSort } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Payroll run' };

const sorts = [
  { value: 'name', label: 'Name' },
  { value: 'net-desc', label: 'Highest net pay' },
  { value: 'lop-desc', label: 'Most loss of pay' },
];

type PayrollRunPageProps = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ search?: string; warnings?: string; sort?: string; page?: string }>;
};

export default async function PayrollRunPage({ params, searchParams }: PayrollRunPageProps) {
  const access = await requireAccess();
  const canManage = access.permissions[permissionKeys.payrollManage] !== undefined;
  const canApprove = access.permissions[permissionKeys.payrollApprove] !== undefined;
  if (!canManage && !canApprove) notFound();

  const runId = parseId((await params).runId);
  if (!runId) notFound();
  const run = await getPayrollRun(runId);
  if (!run) notFound();

  const query = await searchParams;
  const sort = (sorts.find((item) => item.value === query.sort)?.value ?? 'name') as PayrollLineSort;
  const page = parsePage(query.page);
  const warningsOnly = query.warnings === 'yes';
  const { lines, total } = await listPayrollLines(run.id, { search: query.search, warningsOnly, sort, page });
  const isDraft = run.status === 'draft';
  const monthName = formatPayrollMonth(run.month);

  function hrefForPage(target: number) {
    const next = new URLSearchParams();
    if (query.search) next.set('search', query.search);
    if (warningsOnly) next.set('warnings', 'yes');
    next.set('sort', sort);
    next.set('page', String(target));
    return `/hr/payroll/${run!.id}?${next.toString()}`;
  }

  return (
    <>
      <PageHeader
        title={`Payroll for ${monthName}`}
        description={`Prepared by ${run.preparer?.full_name ?? 'someone who has left'}${run.submitted_at ? `, sent for approval ${formatDateTime(run.submitted_at)}` : ''}.`}
        actions={
          <>
            <ButtonLink href={`/hr/payroll/${run.id}/export`} prefetch={false}>
              <Download size={16} aria-hidden="true" />
              Export CSV
            </ButtonLink>
            {canManage && isDraft && (
              <>
                <ActionButton label="Recalculate" variant="secondary" action={recalculatePayrollRunAction.bind(null, run.id)} />
                <ConfirmActionButton
                  label="Discard"
                  title={`Discard the ${monthName} payroll?`}
                  description="The draft and any changes to its payslips are deleted. You can start the month again."
                  confirmLabel="Discard draft"
                  action={discardPayrollRunAction.bind(null, run.id)}
                />
                <ConfirmActionButton
                  label="Send for approval"
                  title={`Send the ${monthName} payroll to Finance?`}
                  description="It is worked out once more, then locked while Finance reviews it. Finance can send it back with a note."
                  confirmLabel="Send for approval"
                  variant="primary"
                  action={submitPayrollRunAction.bind(null, run.id)}
                />
              </>
            )}
            {canApprove && run.status === 'in_review' && (
              <ButtonLink href={`/hr/payroll/${run.id}/review`} variant="primary">
                Approve or send back
              </ButtonLink>
            )}
            {canApprove && run.status === 'approved' && (
              <ButtonLink href={`/hr/payroll/${run.id}/pay`} variant="primary">
                Mark as paid
              </ButtonLink>
            )}
          </>
        }
      />
      <div className={layout.stack}>
        <div className={layout.badges}>
          <PayrollStatusBadge status={run.status} />
          {run.decider && run.decided_at && (
            <span className={layout.muted}>
              {run.status === 'draft' ? 'Sent back' : 'Approved'} by {run.decider.full_name} on {formatDateTime(run.decided_at)}
            </span>
          )}
          {run.status === 'paid' && run.paid_on && (
            <span className={layout.muted}>
              Paid on {formatDate(run.paid_on)} by {paymentMethodLabels[run.payment_method ?? 'other']}
              {run.payment_reference ? `, reference ${run.payment_reference}` : ''}
            </span>
          )}
        </div>
        {run.review_note && (
          <Panel title={run.status === 'draft' ? 'Sent back by Finance' : 'Finance note'}>
            <p className={layout.text}>{run.review_note}</p>
          </Panel>
        )}
        <StatTiles
          tiles={[
            { label: 'People', value: run.employee_count },
            { label: 'Gross pay', value: formatRupees(run.total_gross) },
            { label: 'Deductions', value: formatRupees(run.total_deductions) },
            { label: 'Net pay', value: formatRupees(run.total_net) },
            { label: 'Cost to company', value: formatRupees(run.total_employer_cost) },
          ]}
        />
        <form method="get" className={filterStyles.filters}>
          <TextField label="Search" name="search" type="search" placeholder="Name or employee ID" defaultValue={query.search} />
          <SelectField label="Show" name="warnings" options={[{ value: 'yes', label: 'Only payslips with warnings' }]} placeholder="Everyone" defaultValue={warningsOnly ? 'yes' : ''} />
          <SelectField label="Sort by" name="sort" options={sorts} defaultValue={sort} />
          <div className={filterStyles.actions}>
            <Button type="submit">Apply</Button>
            <ButtonLink href={`/hr/payroll/${run.id}`} variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <Panel title="Payslips" description={isDraft ? 'Open a payslip to change variable pay, deductions or loss of pay.' : 'Locked while it is with Finance or paid.'} flush>
          {lines.length === 0 ? (
            <EmptyState
              icon={Users}
              title={query.search || warningsOnly ? 'No matching payslips' : 'Nobody on this run'}
              description={query.search || warningsOnly ? 'Try different filters.' : 'Add salary structures for active employees, then recalculate.'}
            />
          ) : (
            <>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Employee</th>
                      <th scope="col" className={tableStyles.numeric}>Paid days</th>
                      <th scope="col" className={tableStyles.numeric}>Loss of pay</th>
                      <th scope="col" className={tableStyles.numeric}>Gross</th>
                      <th scope="col" className={tableStyles.numeric}>Deductions</th>
                      <th scope="col" className={tableStyles.numeric}>Net pay</th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <p className={tableStyles.primaryText}>{line.employee?.full_name}</p>
                          <p className={tableStyles.secondaryText}>
                            {[line.employee?.employee_code, line.employee?.department?.name].filter(Boolean).join(' · ')}
                          </p>
                          {line.warnings.map((warning) => (
                            <p key={warning} className={`${tableStyles.secondaryText} ${layout.badges}`}>
                              <TriangleAlert size={14} aria-hidden="true" /> {warning}
                            </p>
                          ))}
                        </td>
                        <td className={tableStyles.numeric}>
                          {line.paid_days} / {line.days_in_month}
                        </td>
                        <td className={tableStyles.numeric}>{line.lop_days > 0 ? `${line.lop_days} days` : '—'}</td>
                        <td className={tableStyles.numeric}>{formatRupees(line.gross_earnings)}</td>
                        <td className={tableStyles.numeric}>{formatRupees(line.total_deductions)}</td>
                        <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(line.net_pay)}</td>
                        <td>
                          <div className={tableStyles.rowActions}>
                            {canManage && isDraft && (
                              <ButtonLink href={`/hr/payroll/${run.id}/lines/${line.id}`} variant="ghost">
                                Change
                              </ButtonLink>
                            )}
                            <Link href={`/payslips/${line.id}/print`} className={tableStyles.primaryLink} aria-label={`Payslip for ${line.employee?.full_name}`}>
                              <Printer size={16} aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar page={page} perPage={payrollLinesPerPage} total={total} hrefForPage={hrefForPage} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
