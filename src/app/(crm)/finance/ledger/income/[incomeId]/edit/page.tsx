import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IncomeForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getIncome, getLedgerOptions } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Edit income' };

export default async function EditIncomePage({ params }: { params: Promise<{ incomeId: string }> }) {
  const access = await requirePagePermission(permissionKeys.ledgerManage);
  const incomeId = parseId((await params).incomeId);
  if (!incomeId) notFound();
  const income = await getIncome(incomeId);
  if (!income || income.deleted_at) notFound();
  const options = await getLedgerOptions(access, 'income', { categoryId: income.category_id, accountId: income.bank_account_id });
  return (
    <>
      <PageHeader title="Edit income" />
      <Panel>
        <IncomeForm income={income} options={options} today={todayInIndia()} />
      </Panel>
    </>
  );
}