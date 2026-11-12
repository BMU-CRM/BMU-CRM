import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { listFinanceCategories } from './ledgerService';
import { listMyRecentFiles } from './hrService';

export const reimbursementsPerPage = 25;

const claimFields = `
  id, employee_id, category_id, description, expense_date, amount, status, decided_at, decision_note,
  paid_on, payment_method, payment_reference, settled_in_resignation_id, created_at,
  category:finance_categories(name),
  receipt:files(id, name),
  account:bank_accounts(name),
  employee:employees!reimbursements_employee_id_fkey!inner(id, full_name, employee_code, reporting_manager_id,
    department:departments!employees_department_id_fkey(name)),
  decider:employees!reimbursements_decided_by_fkey(full_name),
  payer:employees!reimbursements_paid_by_fkey(full_name)
`;

export async function listMyReimbursements(access: CurrentAccess, { status, page }: { status?: string; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * reimbursementsPerPage;
  let query = database
    .from('reimbursements')
    .select(claimFields, { count: 'exact' })
    .eq('employee_id', access.employee.id)
    .order('created_at', { ascending: false })
    .range(from, from + reimbursementsPerPage - 1);
  if (status) query = query.eq('status', status as 'submitted');
  const { data, count, error } = await query;
  if (error) throw error;
  return { claims: data, total: count ?? 0 };
}

export async function getMyClaimTotals(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('reimbursements').select('status, amount').eq('employee_id', access.employee.id);
  if (error) throw error;
  const sum = (status: string) => data.filter((row) => row.status === status).reduce((total, row) => total + Number(row.amount), 0);
  return { waiting: sum('submitted'), toBePaid: sum('approved'), paid: sum('paid') };
}

export async function getReimbursement(claimId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('reimbursements').select(claimFields).eq('id', claimId).maybeSingle();
  if (error) throw error;
  return data;
}

export type Reimbursement = NonNullable<Awaited<ReturnType<typeof getReimbursement>>>;

// Claims waiting for this person's decision: from people they manage, or within the
// reach of their approval permission. Never their own.
export async function listClaimsToDecide(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('reimbursements')
    .select(claimFields)
    .eq('status', 'submitted')
    .neq('employee_id', access.employee.id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  // Reading a claim is wider than deciding it (Finance reads every claim), so each
  // person is checked once with the same rule the database uses.
  const people = [...new Set(data.map((claim) => claim.employee_id))];
  const allowed = new Set(
    (await Promise.all(people.map(async (id) => ((await canDecideClaim(id)) ? id : null)))).filter(Boolean),
  );
  return data.filter((claim) => allowed.has(claim.employee_id));
}

export async function canDecideClaim(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('can_decide_reimbursement', { p_employee: employeeId });
  if (error) throw error;
  return Boolean(data);
}

// Finance's view: approved claims to pay, or those already paid, by month paid.
export async function listClaimsForFinance({ status, search, month, page }: { status: 'approved' | 'paid' | 'submitted'; search?: string; month?: string; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * reimbursementsPerPage;
  let query = database
    .from('reimbursements')
    .select(claimFields, { count: 'exact' })
    .eq('status', status)
    .range(from, from + reimbursementsPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.ilike('employee.full_name', `%${term}%`);
  if (status === 'paid' && month) {
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    query = query.gte('paid_on', `${month}-01`).lte('paid_on', end);
  }
  query = status === 'paid' ? query.order('paid_on', { ascending: false }) : query.order('created_at', { ascending: true });
  const { data, count, error } = await query;
  if (error) throw error;
  return { claims: data, total: count ?? 0 };
}

export async function getClaimTotals() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('reimbursements').select('status, amount').in('status', ['submitted', 'approved']);
  if (error) throw error;
  const sum = (status: string) => data.filter((row) => row.status === status).reduce((total, row) => total + Number(row.amount), 0);
  return {
    waiting: data.filter((row) => row.status === 'submitted').length,
    waitingAmount: sum('submitted'),
    toPay: data.filter((row) => row.status === 'approved').length,
    toPayAmount: sum('approved'),
  };
}

export async function getClaimOptions(access: CurrentAccess, keepCategoryId?: string) {
  const [categories, files] = await Promise.all([listFinanceCategories('expense'), listMyRecentFiles(access)]);
  return {
    // Salaries, settlements and the other automatic categories are not for claims.
    categories: categories
      .filter((category) => !category.system_key && (category.is_active || category.id === keepCategoryId))
      .map((category) => ({ value: category.id, label: category.name })),
    files: files.map((file) => ({ value: file.id, label: file.name })),
  };
}

export type ApprovalItemType = 'leave' | 'reimbursement' | 'payroll_run' | 'resignation';

export async function getApprovalHistory(type: ApprovalItemType, id: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_approval_history', { p_type: type, p_id: id });
  // Someone who may see the item but not its record simply sees no history.
  if (error) return [];
  return data;
}

export type ApprovalHistoryEntry = Awaited<ReturnType<typeof getApprovalHistory>>[number];

// Payroll runs for Finance: waiting for approval, approved and waiting to be paid.
export async function listRunsForFinance() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_runs')
    .select('id, month, status, employee_count, total_net, submitted_at, decided_at, paid_on, payment_reference')
    .in('status', ['in_review', 'approved'])
    .order('month', { ascending: true });
  if (error) throw error;
  return data;
}

// Salaries paid each month of a year, for the Finance view of salaries.
export async function listPaidRuns(year: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_runs')
    .select('id, month, employee_count, total_gross, total_deductions, total_net, paid_on, payment_method, payment_reference')
    .eq('status', 'paid')
    .gte('month', `${year}-01-01`)
    .lte('month', `${year}-12-01`)
    .order('month', { ascending: false });
  if (error) throw error;
  return data;
}
