import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import type { PtSlab } from '@/lib/validation/payrollSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';

export const payrollRunsPerPage = 24;
export const payrollLinesPerPage = 50;

const runFields = `
  id, month, status, employee_count, total_gross, total_deductions, total_net, total_employer_cost,
  submitted_at, decided_at, review_note, paid_on, payment_method, payment_reference, created_at,
  preparer:employees!payroll_runs_prepared_by_fkey(full_name),
  decider:employees!payroll_runs_decided_by_fkey(full_name),
  payer:employees!payroll_runs_paid_by_fkey(full_name)
`;

export async function listPayrollRuns({ status, year, page }: { status?: string; year?: number; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * payrollRunsPerPage;
  let query = database
    .from('payroll_runs')
    .select(runFields, { count: 'exact' })
    .order('month', { ascending: false })
    .range(from, from + payrollRunsPerPage - 1);
  if (status) query = query.eq('status', status as 'draft');
  if (year) query = query.gte('month', `${year}-01-01`).lte('month', `${year}-12-01`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { runs: data, total: count ?? 0 };
}

export async function getPayrollRun(runId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('payroll_runs').select(runFields).eq('id', runId).maybeSingle();
  if (error) throw error;
  return data;
}

export type PayrollRun = NonNullable<Awaited<ReturnType<typeof getPayrollRun>>>;

const lineFields = `
  id, run_id, employee_id, days_in_month, payable_days, absent_days, unpaid_leave_days, lop_adjustment, lop_days, paid_days,
  overtime_hours, basic, hra, other_allowances, special_allowance, incentive, bonus, overtime_amount, other_earnings,
  components, component_earnings, component_deductions, gross_earnings, pf_employee, pf_employer, esi_employee, esi_employer,
  professional_tax, tds, other_deductions, total_deductions, net_pay, notes, warnings,
  employee:employees!payroll_lines_employee_id_fkey(id, full_name, employee_code, joining_date,
    department:departments!employees_department_id_fkey(name), designation:designations(title))
`;

export type PayrollLineSort = 'name' | 'net-desc' | 'lop-desc';

// A run holds at most a few hundred lines, so they are filtered, sorted by name and
// paged here.
export async function listPayrollLines(runId: string, { search, warningsOnly, sort, page }: { search?: string; warningsOnly?: boolean; sort: PayrollLineSort; page: number }) {
  const term = search ? cleanSearchTerm(search).toLowerCase() : '';
  const lines = (await listAllPayrollLines(runId)).filter(
    (line) =>
      (!term || `${line.employee?.full_name ?? ''} ${line.employee?.employee_code ?? ''}`.toLowerCase().includes(term)) &&
      (!warningsOnly || line.warnings.length > 0),
  );
  if (sort === 'net-desc') lines.sort((a, b) => b.net_pay - a.net_pay);
  if (sort === 'lop-desc') lines.sort((a, b) => b.lop_days - a.lop_days);
  const from = (page - 1) * payrollLinesPerPage;
  return { lines: lines.slice(from, from + payrollLinesPerPage), total: lines.length };
}

export async function listAllPayrollLines(runId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('payroll_lines').select(lineFields).eq('run_id', runId).limit(5000);
  if (error) throw error;
  return data.sort((a, b) => (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? ''));
}

// One payslip with its run. Row level security shows people only their own paid ones.
export async function getPayrollLine(lineId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_lines')
    .select(`${lineFields}, run:payroll_runs(id, month, status, paid_on)`)
    .eq('id', lineId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PayrollLine = NonNullable<Awaited<ReturnType<typeof getPayrollLine>>>;
export type PayslipComponent = { name: string; kind: 'earning' | 'deduction'; amount: number };

export async function listMyPayslips(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_lines')
    .select('id, gross_earnings, total_deductions, net_pay, paid_days, run:payroll_runs!inner(month, paid_on, status)')
    .eq('employee_id', access.employee.id)
    .eq('run.status', 'paid')
    .limit(120);
  if (error) throw error;
  return data.sort((a, b) => (b.run?.month ?? '').localeCompare(a.run?.month ?? ''));
}

export async function getCompanyProfile() {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_company_profile');
  if (error) throw error;
  return data[0] ?? null;
}

export async function listSalaryComponents() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('salary_components').select('*').order('sort_order').order('name');
  if (error) throw error;
  return data;
}

export async function getSalaryComponent(componentId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('salary_components').select('*').eq('id', componentId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPayrollRules() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_rules')
    .select('*')
    .order('kind')
    .order('state')
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return data.map((rule) => ({ ...rule, slabs: rule.slabs as PtSlab[] | null }));
}

export type PayrollRule = Awaited<ReturnType<typeof listPayrollRules>>[number];

export async function getPayrollRule(ruleId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('payroll_rules').select('*').eq('id', ruleId).maybeSingle();
  if (error) throw error;
  return data && { ...data, slabs: data.slabs as PtSlab[] | null };
}

// What payroll still needs from HR before it can work out deductions.
export async function getPayrollSetupProblems() {
  const database = await createDatabaseClient();
  const [rules, settings] = await Promise.all([
    database.from('payroll_rules').select('kind, state, effective_from').lte('effective_from', todayInIndia()),
    database.from('company_settings').select('default_pt_state').single(),
  ]);
  if (rules.error) throw rules.error;
  const kinds = new Set(rules.data.map((rule) => rule.kind));
  const problems: string[] = [];
  if (!kinds.has('pf')) problems.push('PF rates are not set up.');
  if (!kinds.has('esi')) problems.push('ESI rates are not set up.');
  if (!kinds.has('tds')) problems.push('TDS is not set up. Until it is, TDS is only taken where a salary structure has a fixed monthly TDS.');
  const state = settings.data?.default_pt_state;
  if (!state) problems.push('No professional tax state is chosen, so professional tax is only taken where a salary structure names a state.');
  else if (!rules.data.some((rule) => rule.kind === 'pt' && rule.state?.toLowerCase() === state.toLowerCase())) {
    problems.push(`Professional tax slabs for ${state} are not set up.`);
  }
  return problems;
}

export async function getPayrollSettings() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('company_settings').select('default_pt_state, payroll_absence_lop').single();
  if (error) throw error;
  return data;
}

// Each active person with their salary in force today, for the structures list.
export async function listCurrentStructures({ search, departmentId, missingOnly }: { search?: string; departmentId?: string; missingOnly?: boolean }) {
  const database = await createDatabaseClient();
  let people = database
    .from('employees')
    .select('id, full_name, employee_code, department_id, department:departments!employees_department_id_fkey(name), designation:designations(title)')
    .eq('is_active', true)
    .order('full_name');
  const term = search ? cleanSearchTerm(search) : '';
  if (term) people = people.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%`);
  if (departmentId) people = people.eq('department_id', departmentId);

  const [employees, structures] = await Promise.all([
    people,
    database.from('salary_structures').select('employee_id, effective_from, gross').lte('effective_from', todayInIndia()).order('effective_from', { ascending: false }),
  ]);
  if (employees.error) throw employees.error;
  if (structures.error) throw structures.error;

  const current = new Map<string, { effective_from: string; gross: number }>();
  for (const structure of structures.data) {
    if (!current.has(structure.employee_id)) current.set(structure.employee_id, { effective_from: structure.effective_from, gross: structure.gross ?? 0 });
  }
  const rows = employees.data.map((employee) => ({ ...employee, structure: current.get(employee.id) ?? null }));
  return missingOnly ? rows.filter((row) => !row.structure) : rows;
}

export async function getEmployeeSalary(employeeId: string) {
  const database = await createDatabaseClient();
  const [structures, costs, revisions, appraisals] = await Promise.all([
    database.from('salary_structures').select('*').eq('employee_id', employeeId).order('effective_from', { ascending: false }),
    database.rpc('get_salary_structure_costs', { p_employee: employeeId }),
    database.from('salary_revisions').select('*').eq('employee_id', employeeId).order('effective_from', { ascending: false }),
    database.from('appraisals').select('*, reviewer:employees!appraisals_reviewer_id_fkey(full_name)').eq('employee_id', employeeId).order('period_end', { ascending: false }),
  ]);
  for (const result of [structures, costs, revisions, appraisals]) if (result.error) throw result.error;
  const costById = new Map((costs.data ?? []).map((cost) => [cost.structure_id, cost]));
  return {
    structures: (structures.data ?? []).map((structure) => ({ ...structure, cost: costById.get(structure.id) ?? null })),
    revisions: revisions.data ?? [],
    appraisals: appraisals.data ?? [],
  };
}

export type SalaryStructureWithCost = Awaited<ReturnType<typeof getEmployeeSalary>>['structures'][number];

export const appraisalsPerPage = 25;

export async function listAppraisals({ search, year, page }: { search?: string; year?: number; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * appraisalsPerPage;
  let query = database
    .from('appraisals')
    .select(
      `id, period_label, period_start, period_end, rating, notes, created_at,
       employee:employees!appraisals_employee_id_fkey!inner(id, full_name, department:departments!employees_department_id_fkey(name)),
       reviewer:employees!appraisals_reviewer_id_fkey(full_name)`,
      { count: 'exact' },
    )
    .order('period_end', { ascending: false })
    .range(from, from + appraisalsPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.ilike('employee.full_name', `%${term}%`);
  if (year) query = query.gte('period_end', `${year}-01-01`).lte('period_end', `${year}-12-31`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { appraisals: data, total: count ?? 0 };
}

export async function getAppraisal(appraisalId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('appraisals').select('*').eq('id', appraisalId).maybeSingle();
  if (error) throw error;
  return data;
}

// Gross pay and employer cost of the last twelve runs, for the HR dashboard.
export async function getPayrollCostTrend() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_runs')
    .select('month, status, total_gross, total_employer_cost')
    .order('month', { ascending: false })
    .limit(12);
  if (error) throw error;
  return data.reverse();
}
