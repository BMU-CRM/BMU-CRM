import Link from 'next/link';
import { Fragment } from 'react';
import { sumMoney } from '@/lib/finance/documentTotals';
import { stateCode } from '@/lib/finance/indianStates';
import { amountInWords, formatAmount, formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import type { FinanceSettings } from '@/server/services/financeService';
import type { DocumentLine, DocumentMoney } from './DocumentLines';
import { PrintButton } from './PrintButton';
import styles from './PrintableDocument.module.css';

type PrintableDocumentProps = {
  heading: string;
  stamp?: string;
  backHref: string;
  facts: { label: string; value: string }[];
  billTo: { name: string | null; address: string | null; gstin: string | null };
  placeOfSupply: string | null;
  settings: FinanceSettings | null;
  lines: DocumentLine[];
  money: DocumentMoney;
  notes: string | null;
  terms: string | null;
  showBankDetails: boolean;
  isTaxInvoice: boolean;
};

// A quotation or invoice laid out for paper. It carries what a GST invoice must show:
// both parties' GSTINs, the place of supply, HSN or SAC codes, the tax split and the
// amount in words.
export function PrintableDocument({
  heading,
  stamp,
  backHref,
  facts,
  billTo,
  placeOfSupply,
  settings,
  lines,
  money,
  notes,
  terms,
  showBankDetails,
  isTaxInvoice,
}: PrintableDocumentProps) {
  const companyName = settings?.legal_name ?? 'Your company name';
  const code = stateCode(placeOfSupply);
  const paid = money.amount_paid ?? 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={backHref}>← Back</Link>
        {!settings?.legal_name && (
          <span className={styles.toolbarNote}>Add your company details in Settings, Finance settings, so they print here.</span>
        )}
        <PrintButton />
      </div>

      <article className={styles.sheet}>
        <header className={styles.top}>
          <div className={styles.company}>
            <p className={styles.companyName}>{companyName}</p>
            {settings?.address && <p className={styles.preserve}>{settings.address}</p>}
            {settings?.state && (
              <p>
                {settings.state}
                {stateCode(settings.state) ? ` (state code ${stateCode(settings.state)})` : ''}
              </p>
            )}
            {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
            {settings?.pan && <p>PAN: {settings.pan}</p>}
            {(settings?.email || settings?.phone) && <p>{[settings.email, settings.phone].filter(Boolean).join(' · ')}</p>}
          </div>
          <div>
            <h1 className={styles.documentTitle}>{heading}</h1>
            {stamp && (
              <p className={styles.stampRow}>
                <span className={styles.stamp}>{stamp}</span>
              </p>
            )}
            <dl className={styles.meta}>
              {facts.map((fact) => (
                <Fragment key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </header>

        <section className={styles.parties}>
          <div>
            <p className={styles.label}>Bill to</p>
            <p>
              <strong>{billTo.name}</strong>
            </p>
            {billTo.address && <p className={styles.preserve}>{billTo.address}</p>}
            <p>GSTIN: {billTo.gstin ?? 'Unregistered'}</p>
          </div>
          <div>
            <p className={styles.label}>Place of supply</p>
            <p>{placeOfSupply ? `${placeOfSupply}${code ? ` (${code})` : ''}` : 'Not stated'}</p>
            {isTaxInvoice && <p>Tax payable on reverse charge: No</p>}
          </div>
        </section>

        <div className={styles.tableScroller}>
          <table className={styles.items}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Description</th>
                <th scope="col">HSN/SAC</th>
                <th scope="col" className={styles.number}>
                  Qty
                </th>
                <th scope="col" className={styles.number}>
                  Rate
                </th>
                <th scope="col" className={styles.number}>
                  Taxable value
                </th>
                <th scope="col" className={styles.number}>
                  GST
                </th>
                <th scope="col" className={styles.number}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td className={styles.preserve}>{line.description}</td>
                  <td>{line.hsn_sac ?? ''}</td>
                  <td className={styles.number}>{formatQuantity(line.quantity)}</td>
                  <td className={styles.number}>{formatAmount(line.unit_price)}</td>
                  <td className={styles.number}>{formatAmount(line.taxable_amount)}</td>
                  <td className={styles.number}>
                    {formatQuantity(line.tax_rate)}%<br />
                    {formatAmount(line.tax_amount)}
                  </td>
                  <td className={styles.number}>{formatAmount(sumMoney([line.taxable_amount, line.tax_amount]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className={styles.summary}>
          <div className={styles.words}>
            <p className={styles.label}>Amount in words</p>
            <p>{amountInWords(money.total)}</p>
          </div>
          <dl className={styles.totals}>
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
            <dt className={styles.grand}>Total</dt>
            <dd className={styles.grand}>{formatRupees(money.total)}</dd>
            {paid > 0 && (
              <>
                <dt>Received</dt>
                <dd>{formatRupees(paid)}</dd>
                <dt>Balance due</dt>
                <dd>{formatRupees(sumMoney([money.total, -paid]))}</dd>
              </>
            )}
          </dl>
        </section>

        {notes && (
          <section className={styles.section}>
            <p className={styles.label}>Notes</p>
            <p className={styles.preserve}>{notes}</p>
          </section>
        )}
        {showBankDetails && settings?.bank_details && (
          <section className={styles.section}>
            <p className={styles.label}>Pay to</p>
            <p className={styles.preserve}>{settings.bank_details}</p>
          </section>
        )}
        {terms && (
          <section className={styles.section}>
            <p className={styles.label}>Terms</p>
            <p className={styles.preserve}>{terms}</p>
          </section>
        )}

        <footer className={styles.signature}>
          <p>For {companyName}</p>
          <span className={styles.signatureLine} />
          <p>Authorised signatory</p>
        </footer>
      </article>
    </div>
  );
}
