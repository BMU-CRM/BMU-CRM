import { ArrowLeftRight, Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, periodKeys, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { movementKindLabels } from '@/lib/validation/ledgerSchema';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listBankAccounts, listMovements, type Movement } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Transactions' };

const perPage = 50;

// Where each kind of movement is recorded, to open it.
function sourceHref(movement: Movement) {
  if (movement.kind === 'invoice_payment' && movement.linked_id) return `/invoices/${movement.linked_id}`;
  if (movement.kind === 'payroll' && movement.linked_id) return `/hr/payroll/${movement.linked_id}`;
  if (movement.kind === 'settlement' && movement.linked_id) return `/hr/exits/${movement.linked_id}`;
  if (movement.kind === 'income') return `/finance/ledger/income/${movement.id}/edit`;
  if (movement.kind === 'expense') return `/finance/ledger/expenses/${movement.id}/edit`;
  return null;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const params = await searchParams;
  const { range, period } = chooseRange(params, todayInIndia(), 'this-month');
  const filters = {
    from: range.from,
    to: range.to,
    accountId: parseId(params.accountId),
    direction: params.direction === 'in' || params.direction === 'out' ? params.direction : undefined,
    method: paymentMethods.find((method) => method === params.method),
    kind: Object.keys(movementKindLabels).find((kind) => kind === params.kind),
    search: params.search,
    page: parsePage(params.page),
    perPage,
  } as const;
  const [{ movements, total, totalIn, totalOut }, accounts] = await Promise.all([listMovements(filters), listBankAccounts()]);
  const query = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== 'page'));

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every movement of money, read from where it was recorded: invoice payments, other income, expenses, salaries and settlements."
        actions={
          <ButtonLink href={`/finance/transactions/export?${new URLSearchParams(query)}`} prefetch={false}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </ButtonLink>
        }
      />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Description, party or reference" defaultValue={params.search} />
        <SelectField label="Period" name="period" options={periodKeys.map((key) => ({ value: key, label: periodLabels[key] }))} defaultValue={period ?? ''} placeholder="Chosen dates" />
        <TextField label="From" name="from" type="date" defaultValue={period ? '' : range.from} />
        <TextField label="To" name="to" type="date" defaultValue={period ? '' : range.to} />
        <SelectField label="Account" name="accountId" options={accounts.map((account) => ({ value: account.id, label: account.name }))} placeholder="All accounts" defaultValue={filters.accountId} />
        <SelectField
          label="Direction"
          name="direction"
          options={[
            { value: 'in', label: 'Money in' },
            { value: 'out', label: 'Money out' },
          ]}
          placeholder="Both"
          defaultValue={filters.direction}
        />
        <SelectField label="Kind" name="kind" options={Object.entries(movementKindLabels).map(([value, label]) => ({ value, label }))} placeholder="Every kind" defaultValue={filters.kind} />
        <SelectField label="Method" name="method" options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))} placeholder="Any method" defaultValue={filters.method} />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/finance/transactions" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <StatTiles
        tiles={[
          { label: 'Money in', value: formatRupees(totalIn) },
          { label: 'Money out', value: formatRupees(totalOut) },
          { label: 'Difference', value: formatRupees(totalIn - totalOut) },
          { label: 'Movements', value: total },
        ]}
      />
      <Panel flush>
        {movements.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="No movements" description="Try a different period or filters." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">What</th>
                    <th scope="col">Account</th>
                    <th scope="col" className={tableStyles.numeric}>In</th>
                    <th scope="col" className={tableStyles.numeric}>Out</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => {
                    const href = sourceHref(movement);
                    return (
                      <tr key={`${movement.kind}-${movement.id}`}>
                        <td>{formatDate(movement.occurred_on)}</td>
                        <td>
                          {href ? (
                            <Link href={href} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                              {movement.description ?? movementKindLabels[movement.kind]}
                            </Link>
                          ) : (
                            <p className={tableStyles.primaryText}>{movement.description}</p>
                          )}
                          <p className={tableStyles.secondaryText}>
                            {[movement.counterparty, movement.category_name, movement.reference && `Ref ${movement.reference}`].filter(Boolean).join(' · ')}
                          </p>
                          <StatusBadge tone={movement.direction === 'in' ? 'good' : 'neutral'}>{movementKindLabels[movement.kind] ?? movement.kind}</StatusBadge>
                        </td>
                        <td>
                          <p>{movement.account_name ?? 'No account'}</p>
                          <p className={tableStyles.secondaryText}>{paymentMethodLabels[movement.method]}</p>
                        </td>
                        <td className={tableStyles.numeric}>{movement.direction === 'in' ? formatRupees(Number(movement.amount)) : ''}</td>
                        <td className={tableStyles.numeric}>{movement.direction === 'out' ? formatRupees(Number(movement.amount)) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={filters.page}
              perPage={perPage}
              total={total}
              hrefForPage={(target) => `/finance/transactions?${new URLSearchParams({ ...query, page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </>
  );
}
