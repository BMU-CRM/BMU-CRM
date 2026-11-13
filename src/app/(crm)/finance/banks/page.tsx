import { Landmark, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { maskAccount } from '@/lib/employees/employeeRecordLabels';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { bankAccountTypeLabels } from '@/lib/validation/ledgerSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { getAccountBalances, listBankAccounts } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Bank accounts' };

export default async function BankAccountsPage() {
  await requirePagePermission(permissionKeys.banksManage);
  const [accounts, balances] = await Promise.all([listBankAccounts(), getAccountBalances()]);
  const balanceOf = new Map(balances.map((row) => [row.bank_account_id, Number(row.balance)]));
  const bank = accounts.filter((account) => account.account_type !== 'cash').reduce((sum, account) => sum + (balanceOf.get(account.id) ?? 0), 0);
  const cash = accounts.filter((account) => account.account_type === 'cash').reduce((sum, account) => sum + (balanceOf.get(account.id) ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="Balances are the opening balance plus money in, less money out, from every recorded movement."
        actions={
          <ButtonLink href="/finance/banks/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add account
          </ButtonLink>
        }
      />
      <StatTiles
        tiles={[
          { label: 'In the bank', value: formatRupees(bank) },
          { label: 'Cash in hand', value: formatRupees(cash) },
          { label: 'Total', value: formatRupees(bank + cash) },
        ]}
      />
      <Panel flush>
        {accounts.length === 0 ? (
          <EmptyState icon={Landmark} title="No accounts" description="Add your bank accounts." />
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Type</th>
                  <th scope="col" className={tableStyles.numeric}>Balance today</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link href={`/finance/banks/${account.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                        {account.name}
                      </Link>
                      <p className={tableStyles.secondaryText}>{[account.bank_name, maskAccount(account.account_last4), account.ifsc].filter(Boolean).join(' · ') || '—'}</p>
                      <div>
                        {account.is_primary && <StatusBadge tone="good">Main account</StatusBadge>}
                        {!account.is_active && <StatusBadge>Not in use</StatusBadge>}
                      </div>
                    </td>
                    <td>{bankAccountTypeLabels[account.account_type]}</td>
                    <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(balanceOf.get(account.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
