import { ChartColumn, Scale } from 'lucide-react';
import type { Metadata } from 'next';
import { BarChart } from '@/components/charts/BarChart';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { LineChart } from '@/components/charts/LineChart';
import { NetBarChart } from '@/components/charts/NetBarChart';
import { StackedBar } from '@/components/charts/StackedBar';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PeriodFilter } from '@/components/ui/PeriodFilter';
import { StatTiles, type StatTile } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, monthLabel, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceOverview } from '@/server/services/profitLossService';
import styles from './FinanceDashboard.module.css';

export const metadata: Metadata = { title: 'Finance dashboard' };

type FinanceDashboardProps = {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

const shortMonth = (yearMonth: string) => monthLabel(yearMonth).replace(/ \d{2}(\d{2})$/, " '$1");

const payrollStates: Record<string, string> = { draft: 'being prepared', in_review: 'waiting for approval', approved: 'approved, to pay', paid: 'paid' };

// The Finance person's overview: money in and out, what is owed both ways, what is held,
// and where it goes. Each figure shows only for people who may see the money behind it.
export default async function FinanceDashboardPage({ searchParams }: FinanceDashboardProps) {
  const access = await requirePagePermission(permissionKeys.financeDashboard);
  const params = await searchParams;
  const today = todayInIndia();
  const { range, period } = chooseRange(params, today);
  const overview = await getFinanceOverview(access, range, today);
  const { invoices, statement } = overview;
  const has = (key: string) => access.permissions[key] !== undefined;

  // The period's money first, then what is owed and held right now.
  const tiles: StatTile[] = statement
    ? [
        { label: 'Income', value: formatRupees(statement.totals.revenue), href: '/finance/transactions' },
        { label: 'Expenses', value: formatRupees(statement.totals.expenses), href: '/finance/ledger' },
        { label: statement.totals.net >= 0 ? 'Net profit' : 'Net loss', value: formatRupees(Math.abs(statement.totals.net)), href: '/finance/profit-loss' },
      ]
    : [{ label: 'Income from invoices', value: formatRupees(invoices.summary.collected) }];
  tiles.push({ label: `Receivables now (${invoices.summary.outstandingCount})`, value: formatRupees(invoices.summary.outstanding), href: '/finance/follow-ups' });
  const positions: StatTile[] = [];
  if (overview.payables) {
    positions.push({
      label: 'Payables now',
      value: formatRupees(overview.payables.bills + overview.payables.claims),
      href: has(permissionKeys.purchasesManage) ? '/finance/purchases?status=open' : undefined,
    });
  }
  if (overview.cash !== null) positions.push({ label: 'Cash in hand', value: formatRupees(overview.cash), href: '/finance/banks' });
  if (overview.bank !== null) positions.push({ label: 'In the bank', value: formatRupees(overview.bank), href: '/finance/banks' });
  if (has(permissionKeys.payrollApprove) || has(permissionKeys.payrollManage)) {
    const month = formatPayrollMonth(`${today.slice(0, 7)}-01`);
    positions.push({
      label: overview.payroll ? `Payroll, ${month}: ${payrollStates[overview.payroll.status] ?? overview.payroll.status}` : `Payroll, ${month}: not started`,
      value: overview.payroll ? formatRupees(overview.payroll.total_net) : '—',
      href: overview.payroll ? `/hr/payroll/${overview.payroll.id}` : undefined,
    });
  }

  return (
    <>
      <PageHeader
        title="Finance dashboard"
        description={`${period ? `${periodLabels[period]}: ` : ''}${formatDate(range.from)} to ${formatDate(range.to)}. Income and expenses are money actually received and paid.`}
        actions={
          <>
            {has(permissionKeys.ledgerManage) && (
              <ButtonLink href={`/finance/profit-loss?${new URLSearchParams(period ? { period } : range).toString()}`}>
                <Scale size={16} aria-hidden="true" />
                Profit and loss
              </ButtonLink>
            )}
            {has(permissionKeys.financeReports) && (
              <ButtonLink href={`/finance/reports?${new URLSearchParams(period ? { period } : range).toString()}`}>
                <ChartColumn size={16} aria-hidden="true" />
                Finance reports
              </ButtonLink>
            )}
          </>
        }
      />
      <PeriodFilter basePath="/finance" range={range} period={period} />

      <div className={layout.stack}>
        <StatTiles tiles={tiles} />
        {positions.length > 0 && <StatTiles tiles={positions} />}

        {overview.months ? (
          <div className={styles.charts}>
            <Panel title="Income and expenses by month">
              <GroupedBarChart
                label="Income and expenses by month"
                series={['Income', 'Expenses']}
                groups={overview.months.map((month) => ({ label: shortMonth(month.month), values: [month.moneyIn, month.moneyOut] }))}
                formatValue={formatRupees}
              />
            </Panel>
            <Panel title="Profit or loss by month">
              <NetBarChart
                label="Profit or loss by month"
                data={overview.months.map((month) => ({ label: shortMonth(month.month), value: month.net }))}
                positiveLabel="Profit"
                negativeLabel="Loss"
                formatValue={formatRupees}
              />
            </Panel>
            <Panel title="Revenue growth" description="Money received each month: invoice payments and other income.">
              <LineChart
                label="Revenue each month"
                points={overview.months.map((month) => ({ label: shortMonth(month.month), value: month.moneyIn }))}
                formatValue={formatRupees}
                valueHeading="Revenue"
              />
            </Panel>
            <Panel title="Cash flow" description="Money held across every account at the end of each month.">
              <LineChart
                label="Money held at the end of each month"
                points={(overview.monthEnds ?? []).map((month) => ({ label: shortMonth(month.month), value: month.balance }))}
                formatValue={formatRupees}
                valueHeading="Held"
              />
            </Panel>
            <Panel title="Expenses by department">
              <BarChart
                label="Expenses by department"
                data={(overview.departments ?? []).map((department) => ({ label: department.name, value: department.amount }))}
                formatValue={formatRupees}
                valueHeading="Spent"
              />
            </Panel>
            <Panel title="Money owed to us, by age" description="Every unpaid invoice today, whatever the period.">
              <StackedBar
                label="Unpaid invoices by how late they are"
                colouring="ordered"
                segments={invoices.ageing.map((bucket) => ({ label: bucket.label, value: bucket.amount }))}
                formatValue={formatRupees}
                valueHeading="Owed"
              />
            </Panel>
          </div>
        ) : (
          <div className={layout.columns}>
            <Panel title="Income by month" description="Money received against invoices, month by month.">
              <BarChart
                label="Income received by month"
                orientation="vertical"
                data={invoices.months.map((month) => ({ label: month.label.replace(/ \d{2}(\d{2})$/, " '$1"), value: month.collected }))}
                formatValue={formatRupees}
                valueHeading="Received"
              />
            </Panel>
            <Panel title="Money owed, by age" description="Every unpaid invoice today, whatever the period.">
              <StackedBar
                label="Unpaid invoices by how late they are"
                colouring="ordered"
                segments={invoices.ageing.map((bucket) => ({ label: bucket.label, value: bucket.amount }))}
                formatValue={formatRupees}
                valueHeading="Owed"
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
