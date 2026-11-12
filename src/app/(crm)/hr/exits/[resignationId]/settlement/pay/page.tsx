import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SettlementPaymentForm } from '@/components/exits/ExitForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getResignation, getSettlement } from '@/server/services/exitService';
import { getPayingAccountOptions } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Pay settlement' };

export default async function PaySettlementPage({ params }: { params: Promise<{ resignationId: string }> }) {
  await requirePagePermission(permissionKeys.payrollApprove);
  const resignationId = parseId((await params).resignationId);
  if (!resignationId) notFound();
  const [resignation, settlement] = await Promise.all([getResignation(resignationId), getSettlement(resignationId)]);
  if (!resignation || !settlement || settlement.status !== 'draft') notFound();

  return (
    <>
      <PageHeader
        title={`Pay ${resignation.employee?.full_name}'s settlement`}
        description={`Final amount ${formatRupees(settlement.final_amount ?? 0)}. Check the statement before paying.`}
      />
      <Panel>
        <SettlementPaymentForm resignationId={resignation.id} today={todayInIndia()} {...await getPayingAccountOptions()} />
      </Panel>
    </>
  );
}
