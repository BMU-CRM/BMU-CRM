import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { listFinanceClientOptions } from './financeService';
import { listMyRecentFiles } from './hrService';
import { listDepartments } from './organisationService';

export const ledgerPerPage = 25;

export type LedgerFilters = {
  search?: string;
  categoryId?: string;
  accountId?: string;
  method?: string;
  from: string;
  to: string;
  removed?: boolean;
  sort: 'date-desc' | 'date-asc' | 'amount-desc';
  page: number;
};

function ordered<T extends { order: (column: string, options?: { ascending?: boolean }) => T }>(query: T, sort: LedgerFilters['sort'], dateColumn: string) {
  if (sort === 'date-asc') return query.order(dateColumn, { ascending: true });
  if (sort === 'amount-desc') return query.order('amount', { ascending: false });
  return query.order(dateColumn, { ascending: false }).order('created_at', { ascending: false });
}

export async function listExpenses(filters: LedgerFilters, all = false) {
  const database = await createDatabaseClient();
  const from = (filters.page - 1) * ledgerPerPage;
  let query = database
    .from('expense_records')
    .select(
      `id, spent_on, amount, method, reference, notes, vendor_name, source, source_id, deleted_at, delete_reason, created_at,
       category:finance_categories(name), department:departments(name), account:bank_accounts(name),
       receipt:files(id, name), creator:employees!expense_records_created_by_fkey(full_name)`,
      { count: 'exact' },
    )
    .gte('spent_on', filters.from)
    .lte('spent_on', filters.to);
  query = filters.removed ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  const term = filters.search ? cleanSearchTerm(filters.search) : '';
  if (term) query = query.or(`vendor_name.ilike.%${term}%,notes.ilike.%${term}%,reference.ilike.%${term}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.accountId) query = query.eq('bank_account_id', filters.accountId);
  if (filters.method) query = query.eq('method', filters.method as 'cash');
  query = ordered(query, filters.sort, 'spent_on');
  query = all ? query.range(0, 9999) : query.range(from, from + ledgerPerPage - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function listIncome(filters: LedgerFilters, all = false) {
  const database = await createDatabaseClient();
  const from = (filters.page - 1) * ledgerPerPage;
  let query = database
    .from('income_records')
    .select(
      `id, received_on, amount, method, reference, notes, deleted_at, delete_reason, created_at,
       category:finance_categories(name), client:clients(id, company_name), account:bank_accounts(name),
       file:files(id, name), creator:employees!income_records_created_by_fkey(full_name)`,
      { count: 'exact' },
    )
    .gte('received_on', filters.from)
    .lte('received_on', filters.to);
  query = filters.removed ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  const term = filters.search ? cleanSearchTerm(filters.search) : '';
  if (term) query = query.or(`notes.ilike.%${term}%,reference.ilike.%${term}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.accountId) query = query.eq('bank_account_id', filters.accountId);
  if (filters.method) query = query.eq('method', filters.method as 'cash');
  query = ordered(query, filters.sort, 'received_on');
  query = all ? query.range(0, 9999) : query.range(from, from + ledgerPerPage - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

export async function getExpense(id: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('expense_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getIncome(id: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('income_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listFinanceCategories(kind?: 'income' | 'expense') {
  const database = await createDatabaseClient();
  let query = database.from('finance_categories').select('*').order('kind').order('sort_order').order('name');
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listBankAccounts() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('bank_accounts')
    .select('id, name, account_type, bank_name, account_holder, account_last4, ifsc, opening_balance, opening_date, is_primary, is_active')
    .order('account_type')
    .order('name');
  if (error) throw error;
  return data;
}

export type BankAccount = Awaited<ReturnType<typeof listBankAccounts>>[number];

export async function getBankAccount(id: string) {
  return (await listBankAccounts()).find((account) => account.id === id) ?? null;
}

export async function getAccountBalances(on?: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_account_balances', on ? { p_on: on } : {});
  if (error) throw error;
  return data;
}

export type MovementFilters = {
  from: string;
  to: string;
  accountId?: string;
  direction?: 'in' | 'out';
  method?: string;
  kind?: string;
  search?: string;
  page: number;
  perPage?: number;
};

export async function listMovements({ from, to, accountId, direction, method, kind, search, page, perPage = 50 }: MovementFilters) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_money_movements', {
    p_from: from,
    p_to: to,
    ...(accountId ? { p_account: accountId } : {}),
    ...(direction ? { p_direction: direction } : {}),
    ...(method ? { p_method: method as 'cash' } : {}),
    ...(kind ? { p_kind: kind } : {}),
    ...(search ? { p_search: cleanSearchTerm(search) } : {}),
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });
  if (error) throw error;
  const first = data[0];
  return {
    movements: data,
    total: first ? Number(first.total_count) : 0,
    totalIn: first ? Number(first.total_in) : 0,
    totalOut: first ? Number(first.total_out) : 0,
  };
}

export type Movement = Awaited<ReturnType<typeof listMovements>>['movements'][number];

// Money in and out each month of a year, by category, for the ledger summary.
export async function getLedgerSummary(year: number) {
  const { movements } = await listMovements({ from: `${year}-01-01`, to: `${year}-12-31`, page: 1, perPage: 100000 });
  const months = Array.from({ length: 12 }, (_, index) => ({ month: `${year}-${String(index + 1).padStart(2, '0')}`, moneyIn: 0, moneyOut: 0 }));
  const byCategory = new Map<string, { name: string; direction: string; amount: number }>();
  for (const movement of movements) {
    const month = months[Number(movement.occurred_on.slice(5, 7)) - 1]!;
    const amount = Number(movement.amount);
    if (movement.direction === 'in') month.moneyIn += amount;
    else month.moneyOut += amount;
    const name = movement.kind === 'invoice_payment' ? 'Invoice payments' : (movement.category_name ?? 'Uncategorised');
    const key = `${movement.direction}:${name}`;
    const entry = byCategory.get(key) ?? { name, direction: movement.direction, amount: 0 };
    entry.amount += amount;
    byCategory.set(key, entry);
  }
  return { months, categories: [...byCategory.values()].sort((a, b) => b.amount - a.amount) };
}

// Choices for the income and expense forms. The default account is the main one, or
// cash when there is none.
export async function getLedgerOptions(access: CurrentAccess, kind: 'income' | 'expense', keep: { categoryId?: string; accountId?: string } = {}) {
  const [categories, accounts, departments, clients, files] = await Promise.all([
    listFinanceCategories(kind),
    listBankAccounts(),
    listDepartments(),
    kind === 'income' ? listFinanceClientOptions() : Promise.resolve([]),
    listMyRecentFiles(access),
  ]);
  const usable = accounts.filter((account) => account.is_active || account.id === keep.accountId);
  const primary = accounts.find((account) => account.is_primary && account.is_active) ?? accounts.find((account) => account.account_type === 'cash');
  return {
    categories: categories.filter((category) => category.is_active || category.id === keep.categoryId).map((category) => ({ value: category.id, label: category.name })),
    accounts: usable.map((account) => ({ value: account.id, label: account.name })),
    defaultAccountId: primary?.id ?? usable[0]?.id ?? '',
    departments: departments.map((department) => ({ value: department.id, label: department.name })),
    clients: clients.map((client) => ({ value: client.id, label: client.company_name })),
    files: files.map((file) => ({ value: file.id, label: file.name })),
  };
}

// Accounts to pay salaries and settlements from.
export async function getPayingAccountOptions() {
  const accounts = (await listBankAccounts()).filter((account) => account.is_active);
  const primary = accounts.find((account) => account.is_primary) ?? accounts[0];
  return { accounts: accounts.map((account) => ({ value: account.id, label: account.name })), defaultAccountId: primary?.id ?? '' };
}

export const statementLinesPerPage = 50;

export async function listStatementLines(accountId: string, { show, page }: { show: 'all' | 'unmatched' | 'matched'; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * statementLinesPerPage;
  let query = database
    .from('bank_statement_lines')
    .select('id, line_date, description, reference, amount, balance, matched_kind, matched_id, matched_at', { count: 'exact' })
    .eq('bank_account_id', accountId)
    .order('line_date', { ascending: false })
    .range(from, from + statementLinesPerPage - 1);
  if (show === 'unmatched') query = query.is('matched_id', null);
  if (show === 'matched') query = query.not('matched_id', 'is', null);
  const { data, count, error } = await query;
  if (error) throw error;
  return { lines: data, total: count ?? 0 };
}

export async function getStatementSuggestions(accountId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_statement_suggestions', { p_account: accountId });
  if (error) throw error;
  return data;
}

// Movements in the account, within the statement's dates, that no line matches yet.
export async function listUnmatchedMovements(accountId: string) {
  const database = await createDatabaseClient();
  const range = await database
    .from('bank_statement_lines')
    .select('line_date')
    .eq('bank_account_id', accountId)
    .order('line_date')
    .limit(1);
  const latest = await database
    .from('bank_statement_lines')
    .select('line_date')
    .eq('bank_account_id', accountId)
    .order('line_date', { ascending: false })
    .limit(1);
  const first = range.data?.[0]?.line_date;
  const last = latest.data?.[0]?.line_date;
  if (!first || !last) return [];

  const [{ movements }, matched] = await Promise.all([
    listMovements({ from: first, to: last, accountId, page: 1, perPage: 2000 }),
    database.from('bank_statement_lines').select('matched_kind, matched_id').eq('bank_account_id', accountId).not('matched_id', 'is', null),
  ]);
  const used = new Set((matched.data ?? []).map((row) => `${row.matched_kind}:${row.matched_id}`));
  return movements.filter((movement) => !used.has(`${movement.kind}:${movement.id}`));
}
