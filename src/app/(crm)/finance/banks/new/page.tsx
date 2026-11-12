import type { Metadata } from 'next';
import { BankAccountForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { isEncryptionReady } from '@/server/security/fieldEncryption';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add bank account' };

export default async function NewBankAccountPage() {
  await requirePagePermission(permissionKeys.banksManage);
  return (
    <>
      <PageHeader title="Add bank account" description="Invoices keep printing the bank details from Finance settings." />
      <Panel>
        <BankAccountForm today={todayInIndia()} encryptionReady={isEncryptionReady()} />
      </Panel>
    </>
  );
}
