import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SettlementForm } from '@/components/exits/ExitForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getResignation, getSettlement, getSettlementSuggestion } from '@/server/services/exitService';

export const metadata: Metadata = { title: 'Full and final settlement' };

export default async function SettlementPage({ params }: { params: Promise<{ resignationId: string }> }) {
  await requirePagePermission(permissionKeys.exitsManage);
  const resignationId = parseId((await params).resignationId);
  if (!resignationId) notFound();
  const [resignation, settlement, suggestion] = await Promise.all([
    getResignation(resignationId),
    getSettlement(resignationId),
    getSettlementSuggestion(resignationId),
  ]);
  if (!resignation || !settlement || settlement.status !== 'draft') notFound();

  // Nothing saved yet: start from the suggestion.
  const untouched =
    settlement.pending_salary + settlement.leave_encashment_amount + settlement.notice_recovery + settlement.other_deductions + settlement.other_earnings + settlement.reimbursements_due === 0;
  const values = untouched && suggestion
    ? {
        ...settlement,
        pending_salary: suggestion.pendingSalary,
        leave_encashment_days: suggestion.encashableDays,
        leave_encashment_amount: suggestion.encashmentAmount,
        notice_recovery: suggestion.noticeRecovery,
        reimbursements_due: suggestion.reimbursementsDue,
      }
    : settlement;

  return (
    <>
      <PageHeader title={`Full and final: ${resignation.employee?.full_name}`} description="Check each figure. Finance pays the final amount." />
      <div className={layout.columns}>
        <Panel>
          <SettlementForm resignationId={resignation.id} values={values} />
        </Panel>
        {suggestion && (
          <Panel title="How the suggestion was worked out">
            {!suggestion.hasSalary ? (
              <ul className={layout.factsStacked}>
                <li>No salary structure, so no salary figures could be suggested.</li>
                <li>Reimbursements due: {formatRupees(suggestion.reimbursementsDue)} of approved claims not yet paid.</li>
              </ul>
            ) : (
              <ul className={layout.factsStacked}>
                <li>
                  {suggestion.lastMonthOnPayroll
                    ? 'The last month is already on a payroll run, so no pending salary.'
                    : `Pending salary: ${suggestion.daysWorkedInLastMonth} days of the last month.`}
                </li>
                <li>
                  Leave encashment: {suggestion.encashableDays} unused days of encashable leave at {formatRupees(suggestion.encashmentPerDay)} a day (basic pay over 30).
                </li>
                <li>
                  {suggestion.noticeDays === null
                    ? 'Notice recovery: no notice period is set.'
                    : `Notice recovery: ${suggestion.shortfallDays} of ${suggestion.noticeDays} notice days not served, at gross pay over 30.`}
                </li>
                <li>
                  Reimbursements due: {formatRupees(suggestion.reimbursementsDue)} of approved claims not yet paid. When Finance pays the settlement, those claims are marked paid with it.
                </li>
              </ul>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
