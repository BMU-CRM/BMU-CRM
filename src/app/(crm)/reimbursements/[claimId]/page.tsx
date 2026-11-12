import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApprovalHistoryPanel } from '@/components/approvals/ApprovalHistoryPanel';
import { ReimbursementStatusBadge } from '@/components/reimbursements/ReimbursementStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { DecisionButtons } from '@/components/ui/DecisionButtons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { cancelClaimAction, decideClaimAction } from '@/server/actions/reimbursementActions';
import { requireAccess } from '@/server/services/accessService';
import { canDecideClaim, getReimbursement } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'Reimbursement claim' };

// The claim as its owner, their approver and Finance see it. Row level security decides
// who can open it at all.
export default async function ClaimPage({ params }: { params: Promise<{ claimId: string }> }) {
  const access = await requireAccess();
  const claimId = parseId((await params).claimId);
  if (!claimId) notFound();
  const claim = await getReimbursement(claimId);
  if (!claim) notFound();

  const own = claim.employee_id === access.employee.id;
  const waiting = claim.status === 'submitted';
  const canDecide = waiting && !own && (await canDecideClaim(claim.employee_id));
  const canPay = claim.status === 'approved' && access.permissions[permissionKeys.reimbursementsPay] !== undefined;

  return (
    <>
      <PageHeader
        title={`${formatRupees(claim.amount)} · ${claim.category?.name ?? 'Claim'}`}
        description={`${own ? 'Your claim' : `Claim from ${claim.employee?.full_name}`}, spent on ${formatDate(claim.expense_date)}`}
        actions={
          <>
            {canDecide && (
              <DecisionButtons id={claim.id} subject={`the claim from ${claim.employee?.full_name}`} decide={decideClaimAction.bind(null, claim.id)} />
            )}
            {canPay && (
              <ButtonLink href={`/finance/salaries/reimbursements/${claim.id}/pay`} variant="primary">
                Pay
              </ButtonLink>
            )}
            {own && waiting && (
              <ConfirmActionButton
                label="Cancel claim"
                title="Cancel this claim?"
                description="It stays in your list, marked as cancelled. Submit a new claim if you need to."
                confirmLabel="Cancel claim"
                variant="danger"
                action={cancelClaimAction.bind(null, claim.id)}
              />
            )}
          </>
        }
      />
      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel title="Details" action={<ReimbursementStatusBadge status={claim.status} />}>
            <dl className={layout.factsStacked}>
              <div>
                <dt>What was spent</dt>
                <dd className={layout.text}>{claim.description}</dd>
              </div>
              <div>
                <dt>Employee</dt>
                <dd>
                  {claim.employee?.full_name} · {claim.employee?.department?.name ?? 'No department'}
                </dd>
              </div>
              <div>
                <dt>Receipt</dt>
                <dd>
                  {claim.receipt ? (
                    <Link href={`/files/${claim.receipt.id}`} className={layout.link}>
                      {claim.receipt.name}
                    </Link>
                  ) : (
                    'None attached'
                  )}
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(claim.created_at)}</dd>
              </div>
              {claim.decided_at && (
                <div>
                  <dt>{claim.status === 'rejected' ? 'Rejected' : 'Approved'}</dt>
                  <dd>
                    {formatDateTime(claim.decided_at)} by {claim.decider?.full_name ?? 'a former employee'}
                    {claim.decision_note ? `: ${claim.decision_note}` : ''}
                  </dd>
                </div>
              )}
              {claim.status === 'paid' && claim.paid_on && (
                <div>
                  <dt>Paid</dt>
                  <dd>
                    {formatDate(claim.paid_on)}, {paymentMethodLabels[claim.payment_method ?? 'other']}
                    {claim.payment_reference ? `, ${claim.payment_reference}` : ''}
                    {claim.settled_in_resignation_id ? ' (in the full and final settlement)' : ''}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
        <ApprovalHistoryPanel type="reimbursement" id={claim.id} />
      </div>
    </>
  );
}
