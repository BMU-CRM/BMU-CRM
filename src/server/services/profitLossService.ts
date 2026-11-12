import 'server-only';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { monthsInRange, previousRange, sameRangeLastYear, type DateRange } from '@/lib/finance/financialPeriods';
import { buildStatement, departmentTotals, monthlySeries, type ProfitLossRow } from '@/lib/finance/profitLoss';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { getFinanceReport } from './financeService';
import { getAccountBalances } from './ledgerService';
import { getPayablesSummary } from './purchaseService';
import { getClaimTotals } from './reimbursementService';

export async function getProfitLossRows(range: DateRange): Promise<ProfitLossRow[]> {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_profit_loss', { p_from: range.from, p_to: range.to });
  if (error) throw error;
  return data.map((row) => ({ ...row, amount: Number(row.amount) }));
}

// This period's statement, the one before and the same period last year.
export async function getProfitLossComparison(range: DateRange) {
  const previous = previousRange(range);
  const lastYear = sameRangeLastYear(range);
  const [currentRows, previousRows, lastYearRows] = await Promise.all([getProfitLossRows(range), getProfitLossRows(previous), getProfitLossRows(lastYear)]);
  return {
    ranges: { current: range, previous, lastYear },
    current: buildStatement(currentRows),
    previous: buildStatement(previousRows),
    lastYear: buildStatement(lastYearRows),
    months: monthlySeries(currentRows, monthsInRange(range)),
    departments: departmentTotals(currentRows),
  };
}

export type ProfitLossComparison = Awaited<ReturnType<typeof getProfitLossComparison>>;

function lastDayOf(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Everything on the Finance dashboard. Each figure is fetched only for people who may
// see the money behind it, so nobody gets a half-true total.
export async function getFinanceOverview(access: CurrentAccess, range: DateRange, today: string) {
  const has = (key: string) => access.permissions[key] !== undefined;
  const seesLedger = has(permissionKeys.ledgerManage) || has(permissionKeys.banksManage);
  const months = monthsInRange(range).filter((month) => month <= today.slice(0, 7));

  const [invoices, rows, balances, bills, claims, payroll, monthEnds] = await Promise.all([
    getFinanceReport(range),
    seesLedger ? getProfitLossRows(range) : Promise.resolve(null),
    seesLedger ? getAccountBalances() : Promise.resolve(null),
    has(permissionKeys.purchasesManage) || seesLedger ? getPayablesSummary(today) : Promise.resolve(null),
    has(permissionKeys.reimbursementsPay) ? getClaimTotals() : Promise.resolve(null),
    has(permissionKeys.payrollApprove) || has(permissionKeys.payrollManage) ? getPayrollThisMonth(today) : Promise.resolve(null),
    // The money held at the end of each month, for the cash flow line.
    seesLedger
      ? Promise.all(
          months.map(async (month) => {
            const end = month === today.slice(0, 7) ? today : lastDayOf(month);
            const rowsAt = await getAccountBalances(end);
            return { month, balance: rowsAt.reduce((sum, row) => sum + Number(row.balance), 0) };
          }),
        )
      : Promise.resolve(null),
  ]);

  const statement = rows ? buildStatement(rows) : null;
  const cash = balances ? balances.filter((row) => row.account_type === 'cash').reduce((sum, row) => sum + Number(row.balance), 0) : null;
  const bank = balances ? balances.filter((row) => row.account_type !== 'cash').reduce((sum, row) => sum + Number(row.balance), 0) : null;

  return {
    invoices,
    statement,
    months: rows ? monthlySeries(rows, monthsInRange(range)) : null,
    departments: rows ? departmentTotals(rows) : null,
    cash,
    bank,
    payables: bills || claims ? { bills: bills?.owed ?? 0, claims: claims?.toPayAmount ?? 0 } : null,
    payroll,
    monthEnds,
  };
}

async function getPayrollThisMonth(today: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payroll_runs')
    .select('id, status, total_net, employee_count')
    .eq('month', `${today.slice(0, 7)}-01`)
    .maybeSingle();
  if (error) throw error;
  return data;
}
