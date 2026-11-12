// Profit and loss from the rows get_profit_loss returns. Cash basis: revenue is money
// received, expenses are money paid out. Amounts are added in paise so totals stay exact.

export type ProfitLossSection = 'revenue' | 'salaries' | 'operating';

export type ProfitLossRow = {
  month: string;
  section: ProfitLossSection | string;
  label: string;
  department_name: string | null;
  amount: number;
};

export type StatementLine = { label: string; amount: number };

export type Statement = {
  revenue: StatementLine[];
  salaries: StatementLine[];
  operating: StatementLine[];
  totals: { revenue: number; salaries: number; operating: number; expenses: number; net: number };
};

const paise = (value: number) => Math.round(Number(value) * 100);
const rupees = (value: number) => value / 100;

function linesFor(rows: ProfitLossRow[], section: ProfitLossSection) {
  const byLabel = new Map<string, number>();
  for (const row of rows) {
    if (row.section !== section) continue;
    byLabel.set(row.label, (byLabel.get(row.label) ?? 0) + paise(row.amount));
  }
  return [...byLabel.entries()]
    .map(([label, amount]) => ({ label, amount: rupees(amount) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

const sum = (lines: StatementLine[]) => rupees(lines.reduce((total, line) => total + paise(line.amount), 0));

export function buildStatement(rows: ProfitLossRow[]): Statement {
  const revenue = linesFor(rows, 'revenue');
  const salaries = linesFor(rows, 'salaries');
  const operating = linesFor(rows, 'operating');
  const totals = { revenue: sum(revenue), salaries: sum(salaries), operating: sum(operating), expenses: 0, net: 0 };
  totals.expenses = rupees(paise(totals.salaries) + paise(totals.operating));
  totals.net = rupees(paise(totals.revenue) - paise(totals.expenses));
  return { revenue, salaries, operating, totals };
}

// Money in, money out and the difference for each month given, months as YYYY-MM.
export function monthlySeries(rows: ProfitLossRow[], months: string[]) {
  return months.map((month) => {
    const inMonth = rows.filter((row) => row.month.slice(0, 7) === month);
    const moneyIn = inMonth.filter((row) => row.section === 'revenue').reduce((total, row) => total + paise(row.amount), 0);
    const moneyOut = inMonth.filter((row) => row.section !== 'revenue').reduce((total, row) => total + paise(row.amount), 0);
    return { month, moneyIn: rupees(moneyIn), moneyOut: rupees(moneyOut), net: rupees(moneyIn - moneyOut) };
  });
}

// Expenses by department, largest first. Revenue has no department.
export function departmentTotals(rows: ProfitLossRow[]) {
  const byName = new Map<string, number>();
  for (const row of rows) {
    if (row.section === 'revenue') continue;
    const name = row.department_name ?? 'No department';
    byName.set(name, (byName.get(name) ?? 0) + paise(row.amount));
  }
  return [...byName.entries()].map(([name, amount]) => ({ name, amount: rupees(amount) })).sort((a, b) => b.amount - a.amount);
}

export type ComparedLine = { label: string; current: number; previous: number; lastYear: number };

// One section's lines across three periods, every label that appears in any of them.
export function compareSection(section: ProfitLossSection, current: Statement, previous: Statement, lastYear: Statement): ComparedLine[] {
  const find = (statement: Statement, label: string) => statement[section].find((line) => line.label === label)?.amount ?? 0;
  const labels = [...new Set([current, previous, lastYear].flatMap((statement) => statement[section].map((line) => line.label)))];
  return labels
    .map((label) => ({ label, current: find(current, label), previous: find(previous, label), lastYear: find(lastYear, label) }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.label.localeCompare(b.label));
}

// The change from an earlier figure, as a percentage, or null when there is nothing to
// compare with.
export function percentChange(current: number, earlier: number) {
  if (earlier === 0) return null;
  return Math.round(((current - earlier) / Math.abs(earlier)) * 1000) / 10;
}
