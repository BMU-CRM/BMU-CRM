import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { periodRange } from '@/lib/finance/financialPeriods';
import { balanceDue } from '@/lib/finance/invoiceDue';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { getFinanceReport } from '@/server/services/financeService';
import { listOverdueInvoices } from '@/server/services/invoiceService';
import { listAwaitingQuotations } from '@/server/services/quotationService';

// The revenue view: this month's sales and collections, and what is owed today.
export async function FinanceStatsWidget() {
  const { summary } = await getFinanceReport(periodRange('this-month', todayInIndia()));

  return (
    <StatTiles
      tiles={[
        { label: 'Invoiced this month', value: formatRupees(summary.invoiced), href: '/finance/reports?period=this-month' },
        { label: 'Collected this month', value: formatRupees(summary.collected), href: '/finance/reports?period=this-month' },
        { label: 'Owed to us', value: formatRupees(summary.outstanding), href: '/invoices?status=unpaid' },
        { label: 'Overdue', value: formatRupees(summary.overdue), href: '/invoices?status=overdue' },
      ]}
    />
  );
}

export async function OverdueInvoicesWidget() {
  const invoices = await listOverdueInvoices(5);

  return (
    <Panel title="Overdue invoices" action={<ButtonLink href="/invoices?status=overdue" variant="ghost">All</ButtonLink>} flush>
      {invoices.length === 0 ? (
        <p className={layout.emptyText}>Nothing overdue.</p>
      ) : (
        <ul className={layout.list}>
          {invoices.map((invoice) => (
            <li key={invoice.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/invoices/${invoice.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {invoice.client?.company_name ?? 'Unknown client'}
                </Link>
                <p className={layout.muted}>
                  {invoice.invoice_number} · due {formatDate(invoice.due_date)}
                </p>
              </div>
              <span className={layout.rowTitle}>{formatRupees(balanceDue(invoice))}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export async function AwaitingQuotationsWidget() {
  const quotations = await listAwaitingQuotations(5);
  const today = todayInIndia();

  return (
    <Panel title="Quotations awaiting an answer" action={<ButtonLink href="/quotations?status=sent" variant="ghost">All</ButtonLink>} flush>
      {quotations.length === 0 ? (
        <p className={layout.emptyText}>No quotations waiting.</p>
      ) : (
        <ul className={layout.list}>
          {quotations.map((quotation) => (
            <li key={quotation.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/quotations/${quotation.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {quotation.client?.company_name ?? 'Unknown client'}
                </Link>
                <p className={layout.muted}>
                  {formatRupees(quotation.total)} · {quotation.valid_until < today ? 'expired' : 'valid until'} {formatDate(quotation.valid_until)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
