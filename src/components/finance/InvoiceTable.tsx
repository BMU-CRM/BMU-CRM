import Link from 'next/link';
import styles from '@/components/ui/DataTable.module.css';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { balanceDue } from '@/lib/finance/invoiceDue';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import type { InvoiceListItem } from '@/server/services/invoiceService';
import { InvoiceStatusBadge } from './FinanceBadges';

export function InvoiceTable({ invoices, showClient = true }: { invoices: InvoiceListItem[]; showClient?: boolean }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            {showClient && <th scope="col">Client</th>}
            <th scope="col">Status</th>
            <th scope="col">Date</th>
            <th scope="col">Due</th>
            <th scope="col" className={styles.numeric}>
              Total
            </th>
            <th scope="col" className={styles.numeric}>
              Still due
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <Link href={`/invoices/${invoice.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {invoice.title}
                </Link>
                <p className={styles.secondaryText}>{invoice.invoice_number ?? 'Draft, not numbered yet'}</p>
              </td>
              {showClient && <td>{invoice.client?.company_name ?? 'Unknown client'}</td>}
              <td>
                <div className={layout.badges}>
                  <InvoiceStatusBadge status={invoice.status} dueDate={invoice.due_date} />
                </div>
              </td>
              <td>{formatDate(invoice.issue_date)}</td>
              <td>{formatDate(invoice.due_date)}</td>
              <td className={styles.numeric}>{formatRupees(invoice.total)}</td>
              <td className={styles.numeric}>{formatRupees(balanceDue(invoice))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
