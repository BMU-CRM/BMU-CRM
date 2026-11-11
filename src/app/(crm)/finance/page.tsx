import { ChartColumn } from 'lucide-react';
import type { Metadata } from 'next';
import { BarChart } from '@/components/charts/BarChart';
import { StackedBar } from '@/components/charts/StackedBar';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PeriodFilter } from '@/components/ui/PeriodFilter';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, periodLabels } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceReport } from '@/server/services/financeService';

export const metadata: Metadata = { title: 'Finance dashboard' };

type FinanceDashboardProps = {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

// The Finance person's overview. Today it shows invoice money: what came in, what is
// owed and how late. Expenses, bank balances, payables and payroll join it as those
// parts are built, rather than showing empty figures now.
export default async function FinanceDashboardPage({ searchParams }: FinanceDashboardProps) {
  const access = await requirePagePermission(permissionKeys.financeDashboard);
  const params = await searchParams;
  const { range, period } = chooseRange(params, todayInIndia());
  const report = await getFinanceReport(range);
  const { summary } = report;
  const canOpenReports = access.permissions[permissionKeys.financeReports] !== undefined;

  return (
    <>
      <PageHeader
        title="Finance dashboard"
        description={`${period ? `${periodLabels[period]}: ` : ''}${formatDate(range.from)} to ${formatDate(range.to)}. Income is money received against invoices.`}
        actions={
          canOpenReports && (
            <ButtonLink href={`/finance/reports?${new URLSearchParams(period ? { period } : range).toString()}`}>
              <ChartColumn size={16} aria-hidden="true" />
              Finance reports
            </ButtonLink>
          )
        }
      />
      <PeriodFilter basePath="/finance" range={range} period={period} />

      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Income received', value: formatRupees(summary.collected) },
            { label: `Invoiced (${summary.invoiceCount})`, value: formatRupees(summary.invoiced), href: '/invoices' },
            { label: `Receivables now (${summary.outstandingCount})`, value: formatRupees(summary.outstanding), href: '/invoices?status=unpaid' },
            { label: `Overdue now (${summary.overdueCount})`, value: formatRupees(summary.overdue), href: '/invoices?status=overdue' },
          ]}
        />

        <div className={layout.columns}>
          <Panel title="Income by month" description="Money received against invoices, month by month.">
            <BarChart
              label="Income received by month"
              orientation="vertical"
              data={report.months.map((month) => ({ label: month.label.replace(/ \d{2}(\d{2})$/, " '$1"), value: month.collected }))}
              formatValue={formatRupees}
              valueHeading="Received"
            />
          </Panel>
          <Panel title="Money owed, by age" description="Every unpaid invoice today, whatever the period.">
            <StackedBar
              label="Unpaid invoices by how late they are"
              colouring="ordered"
              segments={report.ageing.map((bucket) => ({ label: bucket.label, value: bucket.amount }))}
              formatValue={formatRupees}
              valueHeading="Owed"
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
