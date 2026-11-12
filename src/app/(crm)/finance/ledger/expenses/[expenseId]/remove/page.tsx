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
import { getExpense } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Remove expense' };

export default async function RemoveExpensePage({ params }: { params: Promise<{ expenseId: string }> }) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const expenseId = parseId((await params).expenseId);
  if (!expenseId) notFound();
  const expense = await getExpense(expenseId);
  if (!expense || expense.deleted_at || expense.source !== 'manual') notFound();
  return (
    <>
      <PageHeader title="Remove expense" description={`${formatRupees(Number(expense.amount))} on ${formatDate(expense.spent_on)}. It is kept, marked as removed.`} />
      <Panel>
        <RemovalForm kind="expense" id={expense.id} backHref="/finance/ledger?view=expenses" />
      </Panel>
    </>
  );
}