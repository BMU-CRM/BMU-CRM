import type { Metadata } from 'next';
import { ExpenseForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getLedgerOptions } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Add expense' };

export default async function NewExpensePage() {
  const access = await requirePagePermission(permissionKeys.ledgerManage);
  return (
    <>
      <PageHeader title="Add expense" description="Salaries and settlements are added automatically when they are paid." />
      <Panel>
        <ExpenseForm options={await getLedgerOptions(access, 'expense')} today={todayInIndia()} />
      </Panel>
    </>
  );
}