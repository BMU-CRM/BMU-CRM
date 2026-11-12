// Stage 11 of HR and Finance: profit and loss (cash basis) and department budgets with
// 80% and 100% warnings.
import { beforeAll, describe, expect, it } from 'vitest';
import { previousRange, sameRangeLastYear } from '@/lib/finance/financialPeriods';
import { buildStatement, compareSection, departmentTotals, monthlySeries, percentChange } from '@/lib/finance/profitLoss';
import { createTestPeople } from './helpers/testDatabase';

describe('working out profit and loss', () => {
  const rows = [
    { month: '2026-10-01', section: 'revenue', label: 'Invoice payments', department_name: null, amount: 10000.1 },
    { month: '2026-10-01', section: 'revenue', label: 'Interest', department_name: null, amount: 0.2 },
    { month: '2026-10-01', section: 'salaries', label: 'Salaries', department_name: 'No department', amount: 6000 },
    { month: '2026-11-01', section: 'operating', label: 'Rent', department_name: 'Management', amount: 5000 },
    { month: '2026-11-01', section: 'operating', label: 'Travel', department_name: 'Management', amount: 500.15 },
  ];

  it('totals each section and the net exactly, without rounding drift', () => {
    const statement = buildStatement(rows);
    expect(statement.totals).toEqual({ revenue: 10000.3, salaries: 6000, operating: 5500.15, expenses: 11500.15, net: -1499.85 });
    expect(statement.operating.map((line) => line.label)).toEqual(['Rent', 'Travel']);
  });

  it('splits money in and out by month, and expenses by department', () => {
    expect(monthlySeries(rows, ['2026-10', '2026-11', '2026-12'])).toEqual([
      { month: '2026-10', moneyIn: 10000.3, moneyOut: 6000, net: 4000.3 },
      { month: '2026-11', moneyIn: 0, moneyOut: 5500.15, net: -5500.15 },
      { month: '2026-12', moneyIn: 0, moneyOut: 0, net: 0 },
    ]);
    expect(departmentTotals(rows)).toEqual([
      { name: 'No department', amount: 6000 },
      { name: 'Management', amount: 5500.15 },
    ]);
  });

  it('compares with the period before and last year, line by line', () => {
    const current = buildStatement(rows);
    const previous = buildStatement([{ month: '2026-08-01', section: 'operating', label: 'Courier', department_name: null, amount: 100 }]);
    const lines = compareSection('operating', current, previous, buildStatement([]));
    expect(lines.map((line) => [line.label, line.current, line.previous])).toEqual([
      ['Rent', 5000, 0],
      ['Travel', 500.15, 0],
      ['Courier', 0, 100],
    ]);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, -100)).toBe(150);
    expect(percentChange(10, 0)).toBeNull();
  });

  it('finds the period before and the same period last year', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(previousRange({ from: '2026-10-01', to: '2026-12-31' })).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(previousRange({ from: '2026-04-01', to: '2027-03-31' })).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(previousRange({ from: '2026-11-05', to: '2026-11-14' })).toEqual({ from: '2026-10-26', to: '2026-11-04' });
    expect(sameRangeLastYear({ from: '2028-02-01', to: '2028-02-29' })).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
});

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const month = today.slice(0, 7);

describe('profit and loss and budgets in the database', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let department = '';
  let travel = '';
  let account = '';
  let budgetId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('head', 'Employee', 'Finance', 'founder');
    // A department of this run's own, with its own head, so other tests' spending does not count.
    const { data } = await admin.from('departments').insert({ name: `Budget dept ${runId}`, head_employee_id: ids.head! }).select('id').single();
    department = data!.id;
    travel = (await admin.from('finance_categories').select('id').eq('name', 'Travel').single()).data!.id;
    account = (await admin.from('bank_accounts').select('id').eq('account_type', 'cash').single()).data!.id;
  });

  async function spend(amount: number) {
    const { error } = await as.finance!.from('expense_records').insert({ category_id: travel, spent_on: today, amount, method: 'cash', bank_account_id: account, department_id: department });
    expect(error).toBeNull();
  }

  const alerts = async (person: string) =>
    (await admin.from('notifications').select('title').eq('recipient_id', ids[person]!).eq('kind', 'budget_alert')).data!.filter((row) => row.title.includes(`Budget dept ${runId}`));

  it('keeps profit and loss and budgets with Finance', async () => {
    expect((await as.hr!.rpc('get_profit_loss', { p_from: `${month}-01`, p_to: today })).error?.message).toContain('permission');
    expect((await as.hr!.rpc('get_budget_usage', { p_from: `${month}-01`, p_to: today })).error?.message).toContain('permission');
    expect((await as.hr!.from('department_budgets').insert({ department_id: department, period_kind: 'month', period_start: `${month}-01`, amount: 1000 })).error).not.toBeNull();
  });

  it('reports expenses by section and department, leaving out removed ones', async () => {
    await spend(300);
    const { data: removed } = await as.finance!.from('expense_records').insert({ category_id: travel, spent_on: today, amount: 999, method: 'cash', bank_account_id: account, department_id: department }).select('id').single();
    await as.finance!.rpc('remove_ledger_entry', { p_kind: 'expense', p_id: removed!.id, p_reason: 'Entered twice' });

    const { data, error } = await as.finance!.rpc('get_profit_loss', { p_from: `${month}-01`, p_to: today });
    expect(error).toBeNull();
    const mine = data!.filter((row) => row.department_name === `Budget dept ${runId}`);
    expect(mine).toEqual([{ month: `${month}-01`, section: 'operating', label: 'Travel', department_name: `Budget dept ${runId}`, amount: 300 }]);
  });

  it('rejects a budget that does not start a month or a financial year', async () => {
    const midMonth = await as.finance!.from('department_budgets').insert({ department_id: department, period_kind: 'month', period_start: '2026-05-15', amount: 1000 });
    expect(midMonth.error).not.toBeNull();
    const yearWrong = await as.finance!.from('department_budgets').insert({ department_id: department, period_kind: 'year', period_start: '2026-05-01', amount: 1000 });
    expect(yearWrong.error).not.toBeNull();
  });

  it('works out spent, remaining and use', async () => {
    const { data, error } = await as.finance!.from('department_budgets').insert({ department_id: department, period_kind: 'month', period_start: `${month}-01`, amount: 1000 }).select('id').single();
    expect(error).toBeNull();
    budgetId = data!.id;
    const usage = (await as.finance!.rpc('get_budget_usage', { p_from: `${month}-01`, p_to: today })).data!.find((row) => row.budget_id === budgetId);
    expect(usage).toMatchObject({ amount: 1000, spent: 300, remaining: 700, utilisation: 30 });
    expect((await as.finance!.from('department_budgets').insert({ department_id: department, period_kind: 'month', period_start: `${month}-01`, amount: 5 })).error).not.toBeNull();
  });

  it('warns Finance and the department head once at 80% and once at 100%', async () => {
    expect(await alerts('finance')).toEqual([]);
    await spend(550);
    expect((await alerts('finance')).map((row) => row.title)).toEqual([`Budget dept ${runId} has used 80% of its budget`]);
    expect(await alerts('head')).toHaveLength(1);

    await spend(10);
    expect(await alerts('finance')).toHaveLength(1);

    await spend(200);
    expect((await alerts('finance')).map((row) => row.title).sort()).toEqual([`Budget dept ${runId} has used 80% of its budget`, `Budget dept ${runId} is over budget`].sort());
    expect(await alerts('head')).toHaveLength(2);
    expect(await alerts('hr')).toEqual([]);
  });

  it('can warn again after the budget is raised and then used up', async () => {
    const raised = await as.finance!.from('department_budgets').update({ amount: 5000 }).eq('id', budgetId).select('id');
    expect(raised.data).toHaveLength(1);
    expect((await admin.from('budget_alerts').select('threshold').eq('budget_id', budgetId)).data).toEqual([]);
    // 1,060 already spent, plus 3,000, is 81% of 5,000.
    await spend(3000);
    expect((await alerts('finance')).filter((row) => row.title.includes('80%'))).toHaveLength(2);
  });
});
