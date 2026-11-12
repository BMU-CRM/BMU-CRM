import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';

export const resignationsPerPage = 25;

const resignationFields = `
  id, employee_id, reason, submitted_on, proposed_last_day, status, notice_days, last_working_day,
  decided_at, decision_note, exit_interview_at, exit_interview_notes, completed_at, created_at,
  employee:employees!resignations_employee_id_fkey!inner(id, full_name, employee_code, joining_date, employment_status, auth_user_id,
    department:departments!employees_department_id_fkey(name), designation:designations(title)),
  decider:employees!resignations_decided_by_fkey(full_name)
`;

export async function listMyResignations(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('resignations')
    .select(resignationFields)
    .eq('employee_id', access.employee.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listResignations({ search, status, sort, page }: { search?: string; status?: string; sort: 'newest' | 'last-day'; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * resignationsPerPage;
  let query = database.from('resignations').select(resignationFields, { count: 'exact' }).range(from, from + resignationsPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.ilike('employee.full_name', `%${term}%`);
  if (status) query = query.eq('status', status as 'submitted');
  query = sort === 'last-day' ? query.order('last_working_day', { ascending: true, nullsFirst: false }) : query.order('created_at', { ascending: false });
  const { data, count, error } = await query;
  if (error) throw error;
  return { resignations: data, total: count ?? 0 };
}

export async function getResignation(resignationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('resignations').select(resignationFields).eq('id', resignationId).maybeSingle();
  if (error) throw error;
  return data;
}

export type Resignation = NonNullable<Awaited<ReturnType<typeof getResignation>>>;

// The latest approved or completed resignation, for leaving letters.
export async function getLeavingResignation(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('resignations')
    .select('id, last_working_day, status')
    .eq('employee_id', employeeId)
    .in('status', ['approved', 'completed'])
    .order('last_working_day', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

export async function listExitTasks(resignationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('exit_tasks')
    .select('id, item_name, category, sort_order, done_at, note, doer:employees!exit_tasks_done_by_fkey(full_name)')
    .eq('resignation_id', resignationId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// Tasks still open for the person, so work can be handed over before they leave.
export async function listOpenTasksFor(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .select('id, title, status, due_date')
    .eq('assignee_id', employeeId)
    .not('status', 'in', '(completed,rejected)')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function getSettlement(resignationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('final_settlements')
    .select('*, payer:employees!final_settlements_paid_by_fkey(full_name), preparer:employees!final_settlements_prepared_by_fkey(full_name)')
    .eq('resignation_id', resignationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type Settlement = NonNullable<Awaited<ReturnType<typeof getSettlement>>>;

export type SettlementSuggestion = {
  hasSalary: boolean;
  pendingSalary: number;
  daysWorkedInLastMonth: number;
  lastMonthOnPayroll: boolean;
  encashableDays: number;
  encashmentPerDay: number;
  encashmentAmount: number;
  noticeDays: number | null;
  shortfallDays: number;
  noticeRecovery: number;
  // Approved claims not yet paid. Paying the settlement marks them paid.
  reimbursementsDue: number;
};

export async function getSettlementSuggestion(resignationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_settlement_suggestion', { p_resignation: resignationId });
  if (error) throw error;
  return data as SettlementSuggestion | null;
}

export async function listExitChecklistItems() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('exit_checklist_items').select('*').order('sort_order').order('name');
  if (error) throw error;
  return data;
}

export async function getNoticePeriod() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('company_settings').select('notice_period_days').single();
  if (error) throw error;
  return data.notice_period_days;
}

// Leavers by month, and headcount at each month's end, for the attrition report and
// the HR dashboard. Headcount counts people who had joined and not yet left.
export async function getAttrition(year: number) {
  const database = await createDatabaseClient();
  const [people, leavers] = await Promise.all([
    database.from('employees').select('id, joining_date, created_at'),
    database
      .from('resignations')
      .select('employee_id, last_working_day, reason')
      .in('status', ['approved', 'completed'])
      .not('last_working_day', 'is', null),
  ]);
  if (people.error) throw people.error;
  if (leavers.error) throw leavers.error;

  const lastDay = new Map(leavers.data.map((row) => [row.employee_id, row.last_working_day!]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const end = new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10);
    const start = `${month}-01`;
    const headcount = people.data.filter((person) => {
      const joined = person.joining_date ?? person.created_at.slice(0, 10);
      const left = lastDay.get(person.id);
      return joined <= end && (!left || left >= end);
    }).length;
    const exits = leavers.data.filter((row) => row.last_working_day! >= start && row.last_working_day! <= end).length;
    return { month, headcount, exits, rate: headcount > 0 ? Math.round((exits / headcount) * 1000) / 10 : 0 };
  });
}
