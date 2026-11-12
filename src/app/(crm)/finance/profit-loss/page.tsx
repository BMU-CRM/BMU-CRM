import { Download, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import { BarChart } from '@/components/charts/BarChart';
import { NetBarChart } from '@/components/charts/NetBarChart';
import { ProfitLossStatement } from '@/components/finance/ProfitLossStatement';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PeriodFilter } from '@/components/ui/PeriodFilter';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, monthLabel, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { percentChange } from '@/lib/finance/profitLoss';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getProfitLossComparison } from '@/server/services/profitLossService';
import chartStyles from '../FinanceDashboard.module.css';

export const metadata: Metadata = { title: 'Profit and loss' };

type ProfitLossPageProps = { searchParams: Promise<{ period?: string; from?: string; to?: string }> };

// Cash basis: money received against money paid out, from the one list of movements.
export default async function ProfitLossPage({ searchParams }: ProfitLossPageProps) {
  await requirePagePermission(permissionKeys.ledgerManage);
  const params = await searchParams;
  const { range, period } = chooseRange(params, todayInIndia());
  const data = await getProfitLossComparison(range);
  const { current, previous } = data;
  const query = new URLSearchParams(period ? { period } : range).toString();
  const change = (now: number, before: number) => {
    const value = percentChange(now, before);
    return value === null ? '' : ` (${value > 0 ? '+' : ''}${value}% on the period before)`;
  };

  return (
    <>
      <PageHeader
        title="Profit and loss"
        description={`${period ? `${periodLabels[period]}: ` : ''}${formatDate(range.from)} to ${formatDate(range.to)}. Cash basis: invoice payments and other income received, against every expense paid.`}
        actions={
          <>
            <ButtonLink href={`/finance/profit-loss/export?${query}`} prefetch={false}>
              <Download size={16} aria-hidden="true" />
              Export CSV
            </ButtonLink>
            <ButtonLink href={`/finance/profit-loss/print?${query}`}>
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
          </>
        }
      />
      <PeriodFilter basePath="/finance/profit-loss" range={range} period={period} />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: `Revenue${change(current.totals.revenue, previous.totals.revenue)}`, value: formatRupees(current.totals.revenue) },
            { label: `Expenses${change(current.totals.expenses, previous.totals.expenses)}`, value: formatRupees(current.totals.expenses) },
            { label: current.totals.net >= 0 ? 'Net profit' : 'Net loss', value: formatRupees(Math.abs(current.totals.net)) },
          ]}
        />
        <Panel title="Statement" flush>
          <ProfitLossStatement data={data} />
        </Panel>
        <div className={chartStyles.charts}>
          <Panel title="Profit or loss each month">
            <NetBarChart
              label="Profit or loss each month"
              data={data.months.map((month) => ({ label: monthLabel(month.month).slice(0, 3), value: month.net }))}
              positiveLabel="Profit"
              negativeLabel="Loss"
              formatValue={formatRupees}
            />
          </Panel>
          <Panel title="Expenses by department" description="Expenses not entered against a department are under No department.">
            <BarChart
              label="Expenses by department"
              data={data.departments.map((department) => ({ label: department.name, value: department.amount }))}
              formatValue={formatRupees}
              valueHeading="Spent"
            />
          </Panel>
        </div>
        <Panel title="Month by month" flush>
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className={tableStyles.numeric}>Revenue</th>
                  <th scope="col" className={tableStyles.numeric}>Expenses</th>
                  <th scope="col" className={tableStyles.numeric}>Profit or loss</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((month) => (
                  <tr key={month.month}>
                    <th scope="row" className={tableStyles.primaryText}>
                      {monthLabel(month.month)}
                    </th>
                    <td className={tableStyles.numeric}>{formatRupees(month.moneyIn)}</td>
                    <td className={tableStyles.numeric}>{formatRupees(month.moneyOut)}</td>
                    <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>
                      {month.net < 0 ? `Loss ${formatRupees(-month.net)}` : formatRupees(month.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
