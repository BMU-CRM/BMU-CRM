import { Pencil, ReceiptText } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { StatementImportForm } from '@/components/finance/LedgerForms';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { maskAccount } from '@/lib/employees/employeeRecordLabels';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { bankAccountTypeLabels, movementKindLabels } from '@/lib/validation/ledgerSchema';
import { matchStatementLineAction, unmatchStatementLineAction } from '@/server/actions/ledgerActions';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getAccountBalances,
  getBankAccount,
  getStatementSuggestions,
  listStatementLines,
  listUnmatchedMovements,
  statementLinesPerPage,
} from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Bank account' };

type BankAccountPageProps = {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ view?: string; show?: string; page?: string }>;
};

export default async function BankAccountPage({ params, searchParams }: BankAccountPageProps) {
  await requirePagePermission(permissionKeys.banksManage);
  const accountId = parseId((await params).accountId);
  if (!accountId) notFound();
  const account = await getBankAccount(accountId);
  if (!account) notFound();

  const query = await searchParams;
  const view = query.view === 'unmatched' ? 'unmatched' : 'statement';
  const show = query.show === 'unmatched' || query.show === 'matched' ? query.show : 'all';
  const page = parsePage(query.page);

  const [balances, { lines, total }, suggestions, unmatched] = await Promise.all([
    getAccountBalances(),
    listStatementLines(account.id, { show, page }),
    getStatementSuggestions(account.id),
    view === 'unmatched' ? listUnmatchedMovements(account.id) : Promise.resolve([]),
  ]);
  const balance = balances.find((row) => row.bank_account_id === account.id);
  const suggestionsByLine = new Map<string, typeof suggestions>();
  for (const suggestion of suggestions) suggestionsByLine.set(suggestion.line_id, [...(suggestionsByLine.get(suggestion.line_id) ?? []), suggestion]);
  const statementBalance = lines.find((line) => line.balance !== null)?.balance ?? null;

  return (
    <>
      <PageHeader
        title={account.name}
        description={[bankAccountTypeLabels[account.account_type], account.bank_name, maskAccount(account.account_last4), account.ifsc].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink href={`/finance/transactions?accountId=${account.id}&period=this-year`}>
              <ReceiptText size={16} aria-hidden="true" />
              Transactions
            </ButtonLink>
            <ButtonLink href={`/finance/banks/${account.id}/edit`}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </ButtonLink>
          </>
        }
      />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: `Opening balance, ${formatDate(account.opening_date)}`, value: formatRupees(Number(account.opening_balance)) },
            { label: 'Money in', value: formatRupees(Number(balance?.money_in ?? 0)) },
            { label: 'Money out', value: formatRupees(Number(balance?.money_out ?? 0)) },
            { label: 'Balance today', value: formatRupees(Number(balance?.balance ?? 0)) },
          ]}
        />
        {account.account_type !== 'cash' && (
          <Panel title="Import a bank statement" description="Download the statement as CSV from your bank, then match each line to what was recorded here.">
            <StatementImportForm accountId={account.id} />
            {statementBalance !== null && (
              <p className={`${layout.muted} ${layout.spaced}`}>
                The latest statement line shows a balance of {formatRupees(Number(statementBalance))}; the recorded balance today is {formatRupees(Number(balance?.balance ?? 0))}.
              </p>
            )}
          </Panel>
        )}
        <PageTabs
          label="Reconciliation"
          tabs={[
            { href: `/finance/banks/${account.id}`, label: 'Statement lines', current: view === 'statement' },
            { href: `/finance/banks/${account.id}?view=unmatched`, label: 'Recorded but not on the statement', current: view === 'unmatched' },
          ]}
        />
        {view === 'statement' ? (
          <>
            <form method="get" className={filterStyles.filters}>
              <SelectField
                label="Show"
                name="show"
                options={[
                  { value: 'unmatched', label: 'Not matched yet' },
                  { value: 'matched', label: 'Matched' },
                ]}
                placeholder="Every line"
                defaultValue={show === 'all' ? '' : show}
              />
            </form>
            <Panel flush>
              {lines.length === 0 ? (
                <EmptyState icon={ReceiptText} title="No statement lines" description={account.account_type === 'cash' ? 'Cash has no bank statement.' : 'Import a statement to reconcile this account.'} />
              ) : (
                <>
                  <div className={tableStyles.scroller}>
                    <table className={tableStyles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Date</th>
                          <th scope="col">Statement says</th>
                          <th scope="col" className={tableStyles.numeric}>Amount</th>
                          <th scope="col">Recorded as</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => {
                          const options = suggestionsByLine.get(line.id) ?? [];
                          return (
                            <tr key={line.id}>
                              <td>{formatDate(line.line_date)}</td>
                              <td>
                                <p className={tableStyles.primaryText}>{line.description || '—'}</p>
                                {line.reference && <p className={tableStyles.secondaryText}>Ref {line.reference}</p>}
                              </td>
                              <td className={tableStyles.numeric}>{formatRupees(Number(line.amount))}</td>
                              <td>
                                {line.matched_id ? (
                                  <div className={layout.badges}>
                                    <StatusBadge tone="good">Matched: {movementKindLabels[line.matched_kind ?? ''] ?? line.matched_kind}</StatusBadge>
                                    <ActionButton label="Unmatch" action={unmatchStatementLineAction.bind(null, account.id, line.id)} />
                                  </div>
                                ) : options.length === 0 ? (
                                  <p className={tableStyles.secondaryText}>
                                    Nothing recorded matches.{' '}
                                    <Link href={Number(line.amount) < 0 ? '/finance/ledger/expenses/new' : '/finance/ledger/income/new'} className={tableStyles.primaryLink}>
                                      Record it
                                    </Link>
                                  </p>
                                ) : (
                                  <ul className={layout.factsStacked}>
                                    {options.slice(0, 3).map((option) => (
                                      <li key={`${option.kind}-${option.movement_id}`} className={layout.badges}>
                                        <span className={tableStyles.secondaryText}>
                                          {movementKindLabels[option.kind] ?? option.kind}, {formatDate(option.occurred_on)}: {option.description ?? option.counterparty}
                                        </span>
                                        <ActionButton label="Match" variant="secondary" action={matchStatementLineAction.bind(null, account.id, line.id, option.kind, option.movement_id)} />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={page}
                    perPage={statementLinesPerPage}
                    total={total}
                    hrefForPage={(target) => `/finance/banks/${account.id}?${new URLSearchParams({ ...(show === 'all' ? {} : { show }), page: String(target) })}`}
                  />
                </>
              )}
            </Panel>
          </>
        ) : (
          <Panel title="Recorded in this account, but no statement line matches" description="Within the dates the imported statements cover." flush>
            {unmatched.length === 0 ? (
              <p className={layout.emptyText}>Everything recorded is matched, or no statement has been imported.</p>
            ) : (
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">What</th>
                      <th scope="col" className={tableStyles.numeric}>In</th>
                      <th scope="col" className={tableStyles.numeric}>Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((movement) => (
                      <tr key={`${movement.kind}-${movement.id}`}>
                        <td>{formatDate(movement.occurred_on)}</td>
                        <td>
                          <p className={tableStyles.primaryText}>{movement.description}</p>
                          <p className={tableStyles.secondaryText}>{[movementKindLabels[movement.kind], movement.counterparty, movement.reference].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className={tableStyles.numeric}>{movement.direction === 'in' ? formatRupees(Number(movement.amount)) : ''}</td>
                        <td className={tableStyles.numeric}>{movement.direction === 'out' ? formatRupees(Number(movement.amount)) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
