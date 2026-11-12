import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExpenseForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getExpense, getLedgerOptions } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Edit expense' };

export default async function EditExpensePage({ params }: { params: Promise<{ expenseId: string }> }) {
  const access = await requirePagePermission(permissionKeys.ledgerManage);
  const expenseId = parseId((await params).expenseId);
  if (!expenseId) notFound();
  const expense = await getExpense(expenseId);
  if (!expense || expense.deleted_at || expense.source !== 'manual') notFound();
  const options = await getLedgerOptions(access, 'expense', { categoryId: expense.category_id, accountId: expense.bank_account_id });
  return (
    <>
      <PageHeader title="Edit expense" />
      <Panel>
        <ExpenseForm expense={expense} options={options} today={todayInIndia()} />
      </Panel>
    </>
  );
}