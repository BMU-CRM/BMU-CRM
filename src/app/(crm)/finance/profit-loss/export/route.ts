import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { chooseRange, monthLabel } from '@/lib/finance/financialPeriods';
import { compareSection } from '@/lib/finance/profitLoss';
import { todayInIndia } from '@/lib/formatDate';
import { getActionAccess } from '@/server/services/accessService';
import { getProfitLossComparison } from '@/server/services/profitLossService';

const sectionNames = { revenue: 'Revenue', salaries: 'Salary expenses', operating: 'Operating expenses' } as const;

// The statement, then each month, as a spreadsheet.
export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const { range } = chooseRange(params, todayInIndia());
  const data = await getProfitLossComparison(range);
  const { current, previous, lastYear, ranges } = data;
  const money = (value: number) => csvCell(value);

  const rows: string[][] = [];
  for (const section of ['revenue', 'salaries', 'operating'] as const) {
    for (const line of compareSection(section, current, previous, lastYear)) {
      rows.push([csvCell(sectionNames[section]), csvCell(line.label), money(line.current), money(line.previous), money(line.lastYear)]);
    }
    rows.push([csvCell(sectionNames[section]), csvCell('Total'), money(current.totals[section]), money(previous.totals[section]), money(lastYear.totals[section])]);
  }
  rows.push([csvCell('Total expenses'), '', money(current.totals.expenses), money(previous.totals.expenses), money(lastYear.totals.expenses)]);
  rows.push([csvCell('Net profit or loss'), '', money(current.totals.net), money(previous.totals.net), money(lastYear.totals.net)]);
  rows.push([]);
  rows.push([csvCell('Month'), '', csvCell('Revenue'), csvCell('Expenses'), csvCell('Profit or loss')]);
  for (const month of data.months) rows.push([csvCell(monthLabel(month.month)), '', money(month.moneyIn), money(month.moneyOut), money(month.net)]);

  return csvResponse(
    ['Section', 'Line', `${ranges.current.from} to ${ranges.current.to}`, `${ranges.previous.from} to ${ranges.previous.to}`, `${ranges.lastYear.from} to ${ranges.lastYear.to}`],
    rows,
    `profit-and-loss-${range.from}-to-${range.to}.csv`,
  );
}
