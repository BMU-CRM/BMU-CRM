import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BankAccountForm } from '@/components/finance/LedgerForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { isEncryptionReady } from '@/server/security/fieldEncryption';
import { requirePagePermission } from '@/server/services/accessService';
import { getBankAccount } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Edit bank account' };

export default async function EditBankAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  await requirePagePermission(permissionKeys.banksManage);
  const accountId = parseId((await params).accountId);
  if (!accountId) notFound();
  const account = await getBankAccount(accountId);
  if (!account) notFound();
  return (
    <>
      <PageHeader title={`Edit ${account.name}`} />
      <Panel>
        <BankAccountForm account={account} today={todayInIndia()} encryptionReady={isEncryptionReady()} />
      </Panel>
    </>
  );
}
