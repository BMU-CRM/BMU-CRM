import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClaimPaymentForm } from '@/components/reimbursements/ReimbursementForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayingAccountOptions } from '@/server/services/ledgerService';
import { getReimbursement } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'Pay reimbursement' };

export default async function PayClaimPage({ params }: { params: Promise<{ claimId: string }> }) {
  await requirePagePermission(permissionKeys.reimbursementsPay);
  const claimId = parseId((await params).claimId);
  if (!claimId) notFound();
  const [claim, { accounts, defaultAccountId }] = await Promise.all([getReimbursement(claimId), getPayingAccountOptions()]);
  if (!claim || claim.status !== 'approved') notFound();

  return (
    <>
      <PageHeader
        title={`Pay ${formatRupees(claim.amount)} to ${claim.employee?.full_name}`}
        description={`${claim.category?.name}: ${claim.description}. It is filed as an expense under ${claim.category?.name}.`}
      />
      <Panel>
        <ClaimPaymentForm claimId={claim.id} accounts={accounts} defaultAccountId={defaultAccountId} today={todayInIndia()} />
      </Panel>
    </>
  );
}
