import Link from 'next/link';
import styles from '@/components/payroll/PayslipPrint.module.css';
import { sumMoney } from '@/lib/finance/documentTotals';
import { amountInWords, formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { paymentMethodLabels } from '@/lib/validation/financeSchema';
import type { FinanceSettings } from '@/server/services/financeService';
import type { getPaymentReceipt } from '@/server/services/followUpService';
import { PrintButton } from './PrintButton';

type Payment = NonNullable<Awaited<ReturnType<typeof getPaymentReceipt>>>;

// A receipt for one payment against an invoice, laid out like a payslip.
export function ReceiptPrint({ payment, settings }: { payment: Payment; settings: FinanceSettings | null }) {
  const invoice = payment.invoice;
  const company = settings?.legal_name ?? 'Company name not set';
  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={invoice ? `/invoices/${invoice.id}` : '/invoices'}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <p className={styles.company}>{company}</p>
            {settings?.address && <p className={styles.preserve}>{settings.address}</p>}
            {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
          </div>
          <div className={styles.title}>
            <h1>Payment receipt</h1>
            <p>{payment.receipt_number}</p>
          </div>
        </header>
        <dl className={styles.facts}>
          <div>
            <dt>Received from</dt>
            <dd>{invoice?.bill_to_name ?? invoice?.client?.company_name}</dd>
          </div>
          <div>
            <dt>Client GSTIN</dt>
            <dd>{invoice?.client_gstin ?? 'Unregistered'}</dd>
          </div>
          <div>
            <dt>Received on</dt>
            <dd>{formatDate(payment.payment_date)}</dd>
          </div>
          <div>
            <dt>Paid by</dt>
            <dd>
              {paymentMethodLabels[payment.method]}
              {payment.reference ? `, ${payment.reference}` : ''}
            </dd>
          </div>
          <div>
            <dt>Against invoice</dt>
            <dd>{invoice?.invoice_number}</dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>{invoice?.title}</dd>
          </div>
        </dl>
        <p className={styles.net}>
          Amount received <strong>{formatRupees(payment.amount)}</strong>
        </p>
        <p className={styles.words}>{amountInWords(payment.amount)}</p>
        {invoice && (
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Invoice total</td>
                <td className={styles.number}>{formatRupees(invoice.total)}</td>
              </tr>
              <tr>
                <td>Received against the invoice to date</td>
                <td className={styles.number}>{formatRupees(invoice.amount_paid)}</td>
              </tr>
              <tr>
                <td>Balance due to date</td>
                <td className={styles.number}>{formatRupees(Math.max(sumMoney([invoice.total, -invoice.amount_paid]), 0))}</td>
              </tr>
            </tbody>
          </table>
        )}
        {payment.notes && <p className={styles.preserve}>Note: {payment.notes}</p>}
        <p className={styles.footer}>For {company}. Authorised signatory: ______________________</p>
      </article>
    </div>
  );
}
