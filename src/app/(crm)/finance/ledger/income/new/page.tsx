import type { Metadata } from 'next';
import { IncomeForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getLedgerOptions } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Add income' };

export default async function NewIncomePage() {
  const access = await requirePagePermission(permissionKeys.ledgerManage);
  return (
    <>
      <PageHeader title="Add income" />
      <Panel>
        <IncomeForm options={await getLedgerOptions(access, 'income')} today={todayInIndia()} />
      </Panel>
    </>
  );
}