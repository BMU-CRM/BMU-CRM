import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import styles from '@/components/ui/DataTable.module.css';
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

export const metadata: Metadata = { title: 'Finance reports' };

type FinanceReportsPageProps = {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

export default async function FinanceReportsPage({ searchParams }: FinanceReportsPageProps) {
  const access = await requirePagePermission(permissionKeys.financeReports);
  const canOpenClient = access.permissions[permissionKeys.clientsView] !== undefined;
  const params = await searchParams;
  const today = todayInIndia();
  const { range, period } = chooseRange(params, today);
  const report = await getFinanceReport(range);
  const { summary } = report;

  const rangeText = `${formatDate(range.from)} to ${formatDate(range.to)}`;
  const exportHref = `/finance/export?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`;
  const showIgst = report.months.some((month) => month.igst > 0);

  return (
    <>
      <PageHeader
        title="Finance reports"
        description={`${period ? `${periodLabels[period]}: ` : ''}${rangeText}. Only issued invoices count. Drafts and cancelled invoices do not.`}
        actions={
          <ButtonLink href={exportHref} variant="secondary">
            <Download size={16} aria-hidden="true" />
            Download invoices (CSV)
          </ButtonLink>
        }
      />
      <PeriodFilter basePath="/finance/reports" range={range} period={period} />

      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: `Invoiced (${summary.invoiceCount})`, value: formatRupees(summary.invoiced) },
            { label: 'Collected', value: formatRupees(summary.collected) },
            { label: `Owed to us now (${summary.outstandingCount})`, value: formatRupees(summary.outstanding), href: '/invoices?status=unpaid' },
            { label: `Overdue now (${summary.overdueCount})`, value: formatRupees(summary.overdue), href: '/invoices?status=overdue' },
          ]}
        />

        <Panel
          title="Month by month"
          description={`Taxable value ${formatRupees(summary.taxable)} and GST ${formatRupees(summary.gst)} in this period. Use these figures for GST returns.`}
          flush
        >
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className={styles.numeric}>
                    Invoices
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Taxable value
                  </th>
                  <th scope="col" className={styles.numeric}>
                    CGST
                  </th>
                  <th scope="col" className={styles.numeric}>
                    SGST
                  </th>
                  {showIgst && (
                    <th scope="col" className={styles.numeric}>
                      IGST
                    </th>
                  )}
                  <th scope="col" className={styles.numeric}>
                    Invoiced
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Collected
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((month) => (
                  <tr key={month.month}>
                    <th scope="row" className={styles.primaryText}>
                      {month.label}
                    </th>
                    <td className={styles.numeric}>{month.invoiceCount}</td>
                    <td className={styles.numeric}>{formatRupees(month.taxable)}</td>
                    <td className={styles.numeric}>{formatRupees(month.cgst)}</td>
                    <td className={styles.numeric}>{formatRupees(month.sgst)}</td>
                    {showIgst && <td className={styles.numeric}>{formatRupees(month.igst)}</td>}
                    <td className={styles.numeric}>{formatRupees(month.invoiced)}</td>
                    <td className={styles.numeric}>{formatRupees(month.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className={layout.columns}>
          <Panel title="Top clients" description="By amount invoiced in this period." flush>
            {report.clients.length === 0 ? (
              <p className={layout.emptyText}>No invoices or payments in this period.</p>
            ) : (
              <div className={styles.scroller}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Client</th>
                      <th scope="col" className={styles.numeric}>
                        Invoiced
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Collected
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Owed now
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.clients.map((client) => (
                      <tr key={client.clientId}>
                        <td>
                          {/* Client 360 for people with the Clients section; their invoices for everyone else. */}
                          <Link
                            href={canOpenClient ? `/clients/${client.clientId}` : `/invoices?clientId=${client.clientId}`}
                            className={`${styles.primaryText} ${styles.primaryLink}`}
                          >
                            {client.name}
                          </Link>
                        </td>
                        <td className={styles.numeric}>{formatRupees(client.invoiced)}</td>
                        <td className={styles.numeric}>{formatRupees(client.collected)}</td>
                        <td className={styles.numeric}>{formatRupees(client.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Money owed, by age" description="Every unpaid invoice today, whatever the period." flush>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">How late</th>
                    <th scope="col" className={styles.numeric}>
                      Invoices
                    </th>
                    <th scope="col" className={styles.numeric}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.ageing.map((bucket) => (
                    <tr key={bucket.key}>
                      <th scope="row" className={styles.primaryText}>
                        {bucket.label}
                      </th>
                      <td className={styles.numeric}>{bucket.count}</td>
                      <td className={styles.numeric}>{formatRupees(bucket.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
