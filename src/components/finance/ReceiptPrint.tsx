import type { ReactNode } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { sumMoney } from '@/lib/finance/documentTotals';
import { amountInWords, formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { paymentMethodLabels } from '@/lib/validation/financeSchema';
import type { FinanceSettings } from '@/server/services/financeService';
import type { getPaymentReceipt } from '@/server/services/followUpService';
import type { Signatory } from '@/server/services/signatureService';
import { PrintButton } from './PrintButton';
import { DocumentFooter, DocumentLetterhead, SignatureBlock } from './PrintableDocument';
import styles from './PrintableDocument.module.css';

type Payment = NonNullable<Awaited<ReturnType<typeof getPaymentReceipt>>>;

type ReceiptPrintProps = {
  payment: Payment;
  settings: FinanceSettings | null;
  signatory: Signatory | null;
  showSeal: boolean;
  toolbarExtra?: ReactNode;
};

// A receipt for one payment against an invoice: a short invoice with the least needed,
// in the same style.
export function ReceiptPrint({ payment, settings, signatory, showSeal, toolbarExtra }: ReceiptPrintProps) {
  const invoice = payment.invoice;
  const company = settings?.legal_name ?? 'Company name not set';
  const balance = invoice ? Math.max(sumMoney([invoice.total, -invoice.amount_paid]), 0) : 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={invoice ? `/invoices/${invoice.id}` : '/invoices'}>← Back</Link>
        <span className={styles.toolbarActions}>
          {toolbarExtra}
          <PrintButton />
        </span>
      </div>
      <article className={styles.sheet}>
        <DocumentLetterhead
          heading="Receipt"
          facts={[
            { label: 'Receipt no.', value: payment.receipt_number ?? '' },
            { label: 'Received on', value: formatDate(payment.payment_date) },
          ]}
        />

        <section className={styles.parties}>
          <div>
            <p className={styles.label}>Office address</p>
            <p className={styles.partyName}>{company}</p>
            {settings?.address && <p className={styles.preserve}>{settings.address}</p>}
            {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
          </div>
          <div>
            <p className={styles.label}>Received from</p>
            <p className={styles.partyName}>{invoice?.bill_to_name ?? invoice?.client?.company_name}</p>
            {invoice?.bill_to_address && <p className={styles.preserve}>{invoice.bill_to_address}</p>}
            <p>GSTIN: {invoice?.client_gstin ?? 'Unregistered'}</p>
          </div>
        </section>

        <div className={styles.tableScroller}>
          <table className={styles.items}>
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col" className={styles.number}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <p className={styles.itemName}>{invoice?.title ?? 'Payment'}</p>
                  <p className={styles.itemService}>
                    Against invoice {invoice?.invoice_number} · Paid by {paymentMethodLabels[payment.method]}
                    {payment.reference ? `, ${payment.reference}` : ''}
                  </p>
                  {payment.notes && <p className={styles.itemDescription}>{payment.notes}</p>}
                </td>
                <td className={styles.number}>{formatRupees(payment.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className={styles.summary}>
          <div className={styles.words}>
            <p className={styles.noteHeading}>Amount in words:</p>
            <p>{amountInWords(payment.amount)}</p>
          </div>
          <div className={styles.totalsColumn}>
            {invoice && (
              <dl className={styles.totals}>
                <dt>Invoice total</dt>
                <dd>{formatRupees(invoice.total)}</dd>
                <dt>Received to date</dt>
                <dd>{formatRupees(invoice.amount_paid)}</dd>
                <dt>Balance</dt>
                <dd>{formatRupees(balance)}</dd>
              </dl>
            )}
            <p className={styles.totalDue}>
              <span>Amount received</span>
              <strong>{formatRupees(payment.amount)}</strong>
            </p>
          </div>
        </section>

        <section className={styles.closing}>
          <p className={styles.thanks}>Thank you for your payment</p>
          <SignatureBlock companyName={company} signatory={signatory} showSeal={showSeal} />
        </section>

        <DocumentFooter settings={settings} paymentDetails={null} terms={null} />
      </article>
    </div>
  );
}
