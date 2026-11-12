import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RemovalForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getIncome } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Remove income' };

export default async function RemoveIncomePage({ params }: { params: Promise<{ incomeId: string }> }) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const incomeId = parseId((await params).incomeId);
  if (!incomeId) notFound();
  const income = await getIncome(incomeId);
  if (!income || income.deleted_at) notFound();
  return (
    <>
      <PageHeader title="Remove income" description={`${formatRupees(Number(income.amount))} on ${formatDate(income.received_on)}. It is kept, marked as removed.`} />
      <Panel>
        <RemovalForm kind="income" id={income.id} backHref="/finance/ledger?view=income" />
      </Panel>
    </>
  );
}