import { AppLink as Link } from '@/components/ui/AppLink';
import styles from '@/components/ui/DataTable.module.css';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import type { QuotationListItem } from '@/server/services/quotationService';
import { QuotationStatusBadge } from './FinanceBadges';

export function QuotationTable({ quotations, showClient = true }: { quotations: QuotationListItem[]; showClient?: boolean }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Quotation</th>
            {showClient && <th scope="col">Client</th>}
            <th scope="col">Status</th>
            <th scope="col">Date</th>
            <th scope="col">Valid until</th>
            <th scope="col" className={styles.numeric}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {quotations.map((quotation) => (
            <tr key={quotation.id}>
              <td>
                <Link href={`/quotations/${quotation.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {quotation.title}
                </Link>
                <p className={styles.secondaryText}>{quotation.quotation_number}</p>
              </td>
              {showClient && <td>{quotation.client?.company_name ?? 'Unknown client'}</td>}
              <td>
                <div className={layout.badges}>
                  <QuotationStatusBadge status={quotation.status} validUntil={quotation.valid_until} />
                  {quotation.invoice_id && <span className={styles.secondaryText}>Invoiced</span>}
                </div>
              </td>
              <td>{formatDate(quotation.issue_date)}</td>
              <td>{formatDate(quotation.valid_until)}</td>
              <td className={styles.numeric}>{formatRupees(quotation.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
