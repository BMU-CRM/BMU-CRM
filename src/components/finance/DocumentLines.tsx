import styles from '@/components/ui/DataTable.module.css';
import { sumMoney } from '@/lib/finance/documentTotals';
import { amountInWords, formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import lineStyles from './DocumentLines.module.css';

export type DocumentLine = {
  id: string;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  taxable_amount: number;
  tax_amount: number;
};

export type DocumentMoney = {
  is_inter_state: boolean;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total: number;
  amount_paid?: number;
};

// The items and totals of a quotation or invoice, as stored by the database.
export function DocumentLines({ lines, money }: { lines: DocumentLine[]; money: DocumentMoney }) {
  const paid = money.amount_paid ?? 0;

  return (
    <>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">HSN/SAC</th>
              <th scope="col" className={styles.numeric}>
                Qty
              </th>
              <th scope="col" className={styles.numeric}>
                Rate
              </th>
              <th scope="col" className={styles.numeric}>
                GST
              </th>
              <th scope="col" className={styles.numeric}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td>{line.hsn_sac ?? ''}</td>
                <td className={styles.numeric}>{formatQuantity(line.quantity)}</td>
                <td className={styles.numeric}>{formatRupees(line.unit_price)}</td>
                <td className={styles.numeric}>{formatQuantity(line.tax_rate)}%</td>
                <td className={styles.numeric}>{formatRupees(line.taxable_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className={lineStyles.totals}>
        <dt>Taxable value</dt>
        <dd>{formatRupees(money.subtotal)}</dd>
        {money.is_inter_state ? (
          <>
            <dt>IGST</dt>
            <dd>{formatRupees(money.igst_total)}</dd>
          </>
        ) : (
          <>
            <dt>CGST</dt>
            <dd>{formatRupees(money.cgst_total)}</dd>
            <dt>SGST</dt>
            <dd>{formatRupees(money.sgst_total)}</dd>
          </>
        )}
        <dt className={lineStyles.strong}>Total</dt>
        <dd className={lineStyles.strong}>{formatRupees(money.total)}</dd>
        {paid > 0 && (
          <>
            <dt>Received</dt>
            <dd>{formatRupees(paid)}</dd>
            <dt className={lineStyles.strong}>Still due</dt>
            <dd className={lineStyles.strong}>{formatRupees(sumMoney([money.total, -paid]))}</dd>
          </>
        )}
      </dl>
      <p className={lineStyles.words}>{amountInWords(money.total)}</p>
    </>
  );
}
