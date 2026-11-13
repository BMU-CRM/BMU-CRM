import { BookOpen, Download, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { BarChart } from '@/components/charts/BarChart';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, monthLabel, periodKeys, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { movementKindLabels } from '@/lib/validation/ledgerSchema';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getLedgerSummary,
  ledgerPerPage,
  listBankAccounts,
  listExpenses,
  listFinanceCategories,
  listIncome,
  type LedgerFilters,
} from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Income and expenses' };

type LedgerPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

const sorts = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Largest first' },
];

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const params = await searchParams;
  const view = params.view === 'income' ? 'income' : params.view === 'summary' ? 'summary' : 'expenses';
  const today = todayInIndia();

  return (
    <>
      <PageHeader
        title="Income and expenses"
        description="Expenses, and income that did not come against an invoice. Paid salaries and settlements are filed here automatically."
        actions={
          view !== 'summary' && (
            <>
              <ButtonLink href={`/finance/ledger/export?${new URLSearchParams({ ...cleanParams(params), view })}`} prefetch={false}>
                <Download size={16} aria-hidden="true" />
                Export CSV
              </ButtonLink>
              <ButtonLink href={view === 'income' ? '/finance/ledger/income/new' : '/finance/ledger/expenses/new'} variant="primary">
                <Plus size={16} aria-hidden="true" />
                {view === 'income' ? 'Add income' : 'Add expense'}
              </ButtonLink>
            </>
          )
        }
      />
      <PageTabs
        label="Ledger"
        tabs={[
          { href: '/finance/ledger?view=expenses', label: 'Expenses', current: view === 'expenses' },
          { href: '/finance/ledger?view=income', label: 'Other income', current: view === 'income' },
          { href: '/finance/ledger?view=summary', label: 'Summary', current: view === 'summary' },
        ]}
      />
      {view === 'summary' ? <SummaryView year={params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : Number(today.slice(0, 4))} /> : <EntriesView kind={view} params={params} today={today} />}
    </>
  );
}

function cleanParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== 'page'));
}

async function EntriesView({ kind, params, today }: { kind: 'expenses' | 'income'; params: Record<string, string | undefined>; today: string }) {
  const { range, period } = chooseRange(params, today, 'this-year');
  const filters: LedgerFilters = {
    search: params.search,
    categoryId: parseId(params.categoryId),
    accountId: parseId(params.accountId),
    method: paymentMethods.find((method) => method === params.method),
    from: range.from,
    to: range.to,
    removed: params.show === 'removed',
    sort: (sorts.find((sort) => sort.value === params.sort)?.value ?? 'date-desc') as LedgerFilters['sort'],
    page: parsePage(params.page),
  };
  const isIncome = kind === 'income';
  const [{ rows, total }, categories, accounts, everything] = await Promise.all([
    isIncome ? listIncome(filters) : listExpenses(filters),
    listFinanceCategories(isIncome ? 'income' : 'expense'),
    listBankAccounts(),
    isIncome ? listIncome({ ...filters, page: 1 }, true) : listExpenses({ ...filters, page: 1 }, true),
  ]);
  const sum = (everything.rows as { amount: number }[]).reduce((total, row) => total + Number(row.amount), 0);
  const entries = isIncome
    ? (rows as Awaited<ReturnType<typeof listIncome>>['rows']).map((row) => ({
        id: row.id, date: row.received_on, category: row.category?.name, party: row.client?.company_name ?? null, notes: row.notes,
        reference: row.reference, account: row.account?.name, method: row.method, amount: Number(row.amount),
        deletedAt: row.deleted_at, deleteReason: row.delete_reason, source: 'manual', sourceId: null as string | null,
      }))
    : (rows as Awaited<ReturnType<typeof listExpenses>>['rows']).map((row) => ({
        id: row.id, date: row.spent_on, category: row.category?.name, party: row.vendor_name, notes: row.notes,
        reference: row.reference, account: row.account?.name, method: row.method, amount: Number(row.amount),
        deletedAt: row.deleted_at, deleteReason: row.delete_reason, source: row.source, sourceId: row.source_id,
      }));

  function hrefForPage(target: number) {
    return `/finance/ledger?${new URLSearchParams({ ...cleanParams(params), view: kind, page: String(target) })}`;
  }

  return (
    <div className={layout.stack}>
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value={kind} />
        <TextField label="Search" name="search" type="search" placeholder={isIncome ? 'Notes or reference' : 'Paid to, notes or reference'} defaultValue={params.search} />
        <SelectField label="Period" name="period" options={periodKeys.map((key) => ({ value: key, label: periodLabels[key] }))} defaultValue={period ?? ''} placeholder="Chosen dates" />
        <TextField label="From" name="from" type="date" defaultValue={period ? '' : range.from} />
        <TextField label="To" name="to" type="date" defaultValue={period ? '' : range.to} />
        <SelectField label="Category" name="categoryId" options={categories.map((category) => ({ value: category.id, label: category.name }))} placeholder="All categories" defaultValue={filters.categoryId} />
        <SelectField label="Account" name="accountId" options={accounts.map((account) => ({ value: account.id, label: account.name }))} placeholder="All accounts" defaultValue={filters.accountId} />
        <SelectField label="Method" name="method" options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))} placeholder="Any method" defaultValue={filters.method} />
        <SelectField label="Show" name="show" options={[{ value: 'removed', label: 'Removed entries' }]} placeholder="Current entries" defaultValue={params.show} />
        <SelectField label="Sort by" name="sort" options={sorts} defaultValue={filters.sort} />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href={`/finance/ledger?view=${kind}`} variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <StatTiles
        tiles={[
          { label: `${filters.removed ? 'Removed' : isIncome ? 'Other income' : 'Expenses'}, ${formatDate(range.from)} to ${formatDate(range.to)}`, value: formatRupees(sum) },
          { label: 'Entries', value: total },
        ]}
      />
      <Panel flush>
        {entries.length === 0 ? (
          <EmptyState icon={BookOpen} title={`No ${isIncome ? 'income' : 'expenses'} here`} description="Try a different period or filters." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">{isIncome ? 'Category and client' : 'Category and payee'}</th>
                    <th scope="col">Account</th>
                    <th scope="col" className={tableStyles.numeric}>Amount</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => {
                    const automatic = row.source !== 'manual';
                    return (
                      <tr key={row.id}>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <p className={tableStyles.primaryText}>{row.category}</p>
                          <p className={tableStyles.secondaryText}>
                            {[row.party, row.notes, row.reference && `Ref ${row.reference}`].filter(Boolean).join(' · ') || '—'}
                          </p>
                          {automatic && <StatusBadge>{movementKindLabels[row.source]}, added automatically</StatusBadge>}
                          {row.deletedAt && <p className={tableStyles.secondaryText}>Removed: {row.deleteReason}</p>}
                        </td>
                        <td>
                          <p>{row.account}</p>
                          <p className={tableStyles.secondaryText}>{paymentMethodLabels[row.method]}</p>
                        </td>
                        <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(row.amount)}</td>
                        <td>
                          {!row.deletedAt && !automatic && (
                            <div className={tableStyles.rowActions}>
                              <ButtonLink href={`/finance/ledger/${isIncome ? 'income' : 'expenses'}/${row.id}/edit`} variant="ghost">
                                Edit
                              </ButtonLink>
                              <ButtonLink href={`/finance/ledger/${isIncome ? 'income' : 'expenses'}/${row.id}/remove`} variant="ghost">
                                Remove
                              </ButtonLink>
                            </div>
                          )}
                          {row.source === 'payroll' && (
                            <Link href={`/hr/payroll/${row.sourceId}`} className={tableStyles.primaryLink}>
                              Open payroll
                            </Link>
                          )}
                          {row.source === 'reimbursement' && (
                            <Link href={`/reimbursements/${row.sourceId}`} className={tableStyles.primaryLink}>
                              Open claim
                            </Link>
                          )}
                          {row.source === 'settlement' && (
                            <Link href={`/hr/exits/${row.sourceId}`} className={tableStyles.primaryLink}>
                              Open exit
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar page={filters.page} perPage={ledgerPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </div>
  );
}

async function SummaryView({ year }: { year: number }) {
  const { months, categories } = await getLedgerSummary(year);
  const moneyIn = months.reduce((sum, month) => sum + month.moneyIn, 0);
  const moneyOut = months.reduce((sum, month) => sum + month.moneyOut, 0);

  return (
    <div className={layout.stack}>
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value="summary" />
        <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
        <div className={filterStyles.actions}>
          <Button type="submit">Show</Button>
        </div>
      </form>
      <StatTiles
        tiles={[
          { label: `Money in, ${year}`, value: formatRupees(moneyIn) },
          { label: `Money out, ${year}`, value: formatRupees(moneyOut) },
          { label: 'Difference', value: formatRupees(moneyIn - moneyOut) },
        ]}
      />
      <Panel title="Money in and out each month" description="Invoice payments and other income, against every expense including salaries.">
        <BarChart
          label={`Net money each month of ${year}`}
          orientation="vertical"
          data={months.map((month) => ({ label: monthLabel(month.month).slice(0, 3), value: Math.round(month.moneyIn - month.moneyOut) }))}
          valueHeading="Money in less money out"
          formatValue={formatRupees}
        />
      </Panel>
      <div className={layout.columns}>
        <Panel title="By month" flush>
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className={tableStyles.numeric}>Money in</th>
                  <th scope="col" className={tableStyles.numeric}>Money out</th>
                  <th scope="col" className={tableStyles.numeric}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month}>
                    <td>{monthLabel(month.month)}</td>
                    <td className={tableStyles.numeric}>{formatRupees(month.moneyIn)}</td>
                    <td className={tableStyles.numeric}>{formatRupees(month.moneyOut)}</td>
                    <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(month.moneyIn - month.moneyOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="By category" flush>
          {categories.length === 0 ? (
            <p className={layout.emptyText}>Nothing recorded in {year}.</p>
          ) : (
            <ul className={layout.list}>
              {categories.map((category) => (
                <li key={`${category.direction}-${category.name}`} className={layout.row}>
                  <span className={layout.rowMain}>
                    {category.name} <span className={layout.muted}>{category.direction === 'in' ? 'in' : 'out'}</span>
                  </span>
                  <span>{formatRupees(category.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
