import 'server-only';
import type { DateRange } from '@/lib/finance/financialPeriods';
import { createDatabaseClient } from '@/server/database/databaseClient';

// Budgets whose period touches the range, with what has been spent.
export async function listBudgetUsage(range: DateRange, filters: { kind?: 'month' | 'year'; departmentId?: string } = {}) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_budget_usage', { p_from: range.from, p_to: range.to });
  if (error) throw error;
  return data
    .filter((row) => (!filters.kind || row.period_kind === filters.kind) && (!filters.departmentId || row.department_id === filters.departmentId))
    .map((row) => ({ ...row, amount: Number(row.amount), spent: Number(row.spent), remaining: Number(row.remaining), utilisation: Number(row.utilisation) }));
}

export type BudgetUsage = Awaited<ReturnType<typeof listBudgetUsage>>[number];

export async function getBudget(budgetId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('department_budgets').select('id, department_id, period_kind, period_start, amount, notes').eq('id', budgetId).maybeSingle();
  if (error) throw error;
  return data;
}

// "On track", "80% used" or "Over budget".
export function budgetState(utilisation: number) {
  return utilisation >= 100 ? 'over' : utilisation >= 80 ? 'warning' : 'ok';
}
