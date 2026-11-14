import Image from 'next/image';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Fragment, type ReactNode } from 'react';
import { isServiceBilling, itemBillingLabels } from '@/lib/catalog/servicePricing';
import { sumMoney } from '@/lib/finance/documentTotals';
import { stateCode } from '@/lib/finance/indianStates';
import { amountInWords, formatAmount, formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import type { FinanceSettings } from '@/server/services/financeService';
import type { Signatory } from '@/server/services/signatureService';
import type { DocumentLine, DocumentMoney } from './DocumentLines';
import { PrintButton } from './PrintButton';
import styles from './PrintableDocument.module.css';

type PrintLine = DocumentLine & { service_group?: string | null; service_name?: string | null; billing?: string | null };

// The first page holds this many items; the rest continue on the next page.
export const itemsOnFirstPage = 3;

type PrintableDocumentProps = {
  heading: string;
  stamp?: string;
  backHref: string;
  facts: { label: string; value: string }[];
  billTo: { name: string | null; address: string | null; gstin: string | null };
  placeOfSupply: string | null;
  settings: FinanceSettings | null;
  lines: PrintLine[];
  money: DocumentMoney;
  notes: string | null;
  terms: string | null;
  // The company's bank account and UPI, for documents the client still has to pay.
  showBankDetails: boolean;
  isTaxInvoice: boolean;
  // "Bill to" on sales documents; "Vendor" on a purchase order.
  partyLabel?: string;
  // Who signs it, and whether their seal is printed under the signature.
  signatory?: Signatory | null;
  showSeal?: boolean;
  // Printed in the middle of the page, such as "Thank you for your business".
  closingLine?: string;
  // A space for the client to sign, beside the company's signature.
  clientAcceptance?: boolean;
  // Extra controls for the toolbar, which is not printed.
  toolbarExtra?: ReactNode;
};

// The website without https:// and a trailing slash, as printed.
export function websiteLabel(website: string | null | undefined) {
  return website ? website.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
}

// The paper itself: an A4 sheet on screen, and the page settings when printed. The
// website and the page number ("Page 1 of 2") go in the bottom margin of every page.
export function DocumentSheet({ settings, children }: { settings: FinanceSettings | null; children: ReactNode }) {
  const website = websiteLabel(settings?.website) ?? '';
  return (
    <>
      <style>{`@page { size: A4; margin: 14mm 12mm 16mm; @bottom-left { content: ${JSON.stringify(website)}; font: 9pt sans-serif; color: #6b7280; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9pt sans-serif; color: #6b7280; } }`}</style>
      <article className={styles.sheet}>{children}</article>
    </>
  );
}

// The company's letterhead: the logo for light backgrounds, the document's name and
// its numbers.
export function DocumentLetterhead({ heading, stamp, facts }: { heading: string; stamp?: string; facts: { label: string; value: string }[] }) {
  return (
    <header className={styles.top}>
      <Image src="/images/brand/bmu-logo-light.webp" alt="BMU Marketing" width={480} height={212} className={styles.logo} priority />
      <div className={styles.titleBlock}>
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
  );
}

// "For BMU Marketing", the signature over the seal, the line, and the signer's name
// and title.
export function SignatureBlock({ companyName, signatory, showSeal }: { companyName: string; signatory?: Signatory | null; showSeal?: boolean }) {
  return (
    <div className={styles.signature}>
      <p className={styles.forCompany}>For {companyName}</p>
      <div className={styles.marks}>
        {showSeal && signatory?.sealImage && (
          <Image src={signatory.sealImage} alt="Company seal" width={96} height={96} unoptimized className={styles.seal} />
        )}
        {signatory?.signatureImage && (
          <Image src={signatory.signatureImage} alt={`Signature of ${signatory.name}`} width={200} height={80} unoptimized className={styles.signatureImage} />
        )}
      </div>
      <span className={styles.signatureLine} />
      <p className={styles.signer}>{signatory ? `${signatory.name}, ${signatory.title}` : 'Authorised signatory'}</p>
    </div>
  );
}

// Where the client signs to accept.
export function ClientAcceptance() {
  return (
    <div className={styles.signature}>
      <p className={styles.forCompany}>Accepted by client</p>
      <div className={styles.marks} />
      <span className={styles.signatureLine} />
      <p className={styles.signer}>Name, signature &amp; date</p>
    </div>
  );
}

// The company's bank account and UPI, with the QR code to scan.
export function PaymentDetails({ settings }: { settings: FinanceSettings | null }) {
  if (!settings) return null;
  const rows = [
    { label: 'Account name', value: settings.bank_account_name },
    { label: 'Account number', value: settings.bank_account_number },
    { label: 'IFSC', value: settings.bank_ifsc },
    { label: 'SWIFT code', value: settings.bank_swift },
    { label: 'Bank', value: settings.bank_name },
    { label: 'UPI ID', value: settings.upi_id },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  if (rows.length === 0 && !settings.bank_details && !settings.upi_qr_image) return null;

  return (
    <section className={styles.payment} aria-label="Payment details">
      <div className={styles.paymentText}>
        <p className={styles.paymentHeading}>Payment details</p>
        <dl className={styles.paymentRows}>
          {rows.map((row) => (
            <Fragment key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </Fragment>
          ))}
        </dl>
        {settings.bank_details && <p className={`${styles.preserve} ${styles.paymentNote}`}>{settings.bank_details}</p>}
      </div>
      {settings.upi_qr_image && (
        <figure className={styles.qr}>
          <Image src={settings.upi_qr_image} alt="UPI QR code" width={120} height={120} unoptimized />
          <figcaption>Scan to pay via UPI</figcaption>
        </figure>
      )}
    </section>
  );
}

// Notes and terms and conditions, across the page, before the signatures.
export function DocumentTerms({ notes, terms }: { notes: string | null; terms: string | null }) {
  if (!notes && !terms) return null;
  return (
    <section className={styles.terms}>
      {notes && (
        <div>
          <p className={styles.footerHeading}>Notes</p>
          <p className={styles.preserve}>{notes}</p>
        </div>
      )}
      {terms && (
        <div>
          <p className={styles.footerHeading}>Terms and conditions</p>
          <p className={styles.preserve}>{terms}</p>
        </div>
      )}
    </section>
  );
}

// Who to ask, along the bottom of the last page.
export function DocumentFooter({ settings, terms }: { settings: FinanceSettings | null; terms?: string | null }) {
  const website = websiteLabel(settings?.website);
  return (
    <footer className={styles.footer}>
      <div>
        <p className={styles.footerHeading}>Questions?</p>
        <dl className={styles.contact}>
          {settings?.email && (
            <>
              <dt>Email us</dt>
              <dd>{settings.email}</dd>
            </>
          )}
          {settings?.phone && (
            <>
              <dt>Call us</dt>
              <dd>{settings.phone}</dd>
            </>
          )}
          {website && (
            <>
              <dt>Website</dt>
              <dd>{website}</dd>
            </>
          )}
        </dl>
      </div>
      {terms && (
        <div>
          <p className={styles.footerHeading}>Terms and conditions</p>
          <p className={styles.preserve}>{terms}</p>
        </div>
      )}
    </footer>
  );
}

// A quotation, invoice or purchase order laid out for paper, in the company's style. It
// carries what a GST invoice must show: both parties' GSTINs, the place of supply, HSN
// or SAC codes where saved, the tax split (CGST and SGST, or IGST) and the amount in
// words. The first three items are on the first page; the rest continue on the next.
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
  partyLabel = 'Bill to',
  signatory,
  showSeal,
  closingLine,
  clientAcceptance,
  toolbarExtra,
}: PrintableDocumentProps) {
  const companyName = settings?.legal_name ?? 'Your company name';
  const code = stateCode(placeOfSupply);
  const paid = money.amount_paid ?? 0;
  const due = sumMoney([money.total, -paid]);
  const paidInFull = paid > 0 && due <= 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={backHref}>← Back</Link>
        {!settings?.legal_name && (
          <span className={styles.toolbarNote}>Add your company details in Settings, Finance settings, so they print here.</span>
        )}
        <span className={styles.toolbarActions}>
          {toolbarExtra}
          <PrintButton />
        </span>
      </div>

      <DocumentSheet settings={settings}>
        <DocumentLetterhead heading={heading} stamp={stamp} facts={facts} />

        <section className={styles.parties}>
          <div>
            <p className={styles.label}>Office address</p>
            <p className={styles.partyName}>{companyName}</p>
            {settings?.address && <p className={styles.preserve}>{settings.address}</p>}
            {settings?.phone && <p>{settings.phone}</p>}
            {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
            {settings?.pan && <p>PAN: {settings.pan}</p>}
          </div>
          <div>
            <p className={styles.label}>{partyLabel === 'Bill to' ? 'To' : partyLabel}</p>
            <p className={styles.partyName}>{billTo.name}</p>
            {billTo.address && <p className={styles.preserve}>{billTo.address}</p>}
            <p>GSTIN: {billTo.gstin ?? 'Unregistered'}</p>
            <p>
              Place of supply: {placeOfSupply ? `${placeOfSupply}${code ? ` (${code})` : ''}` : 'Not stated'}
            </p>
            {isTaxInvoice && <p>Tax payable on reverse charge: No</p>}
          </div>
        </section>

        <div className={styles.tableScroller}>
          <table className={styles.items}>
            <thead>
              <tr>
                <th scope="col" className={styles.serial}>
                  S.no
                </th>
                <th scope="col">Items description</th>
                <th scope="col" className={styles.number}>
                  Qty
                </th>
                <th scope="col" className={styles.number}>
                  Rate
                </th>
                <th scope="col" className={styles.number}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const billing = line.billing && isServiceBilling(line.billing) ? itemBillingLabels[line.billing] : null;
                // The sub service as the item's name, under its service; else the description.
                const name = line.service_name || line.service_group;
                const group = line.service_name ? line.service_group : null;
                const breaksAfter = index === itemsOnFirstPage - 1 && lines.length > itemsOnFirstPage;
                return (
                  <tr key={line.id} className={breaksAfter ? styles.pageBreakAfter : undefined}>
                    <td className={styles.serial}>{index + 1}</td>
                    <td>
                      {name && <p className={styles.itemName}>{name}</p>}
                      {(group || billing) && (
                        <p className={styles.itemService}>
                          {group}
                          {group && billing ? ' · ' : null}
                          {billing && <span className={styles.billing}>{billing}</span>}
                        </p>
                      )}
                      <p className={name ? styles.itemDescription : styles.itemName}>{line.description}</p>
                      {line.hsn_sac && <p className={styles.itemService}>HSN/SAC {line.hsn_sac}</p>}
                    </td>
                    <td className={styles.number}>{formatQuantity(line.quantity)}</td>
                    <td className={styles.number}>{formatAmount(line.unit_price)}</td>
                    <td className={styles.number}>{formatAmount(line.taxable_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className={styles.summary}>
          <div className={styles.words}>
            <p className={styles.noteHeading}>Amount in words:</p>
            <p>{amountInWords(money.total)}</p>
          </div>
          <div className={styles.totalsColumn}>
            <dl className={styles.totals}>
              <dt>Subtotal</dt>
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
              {paid > 0 && (
                <>
                  <dt>Total</dt>
                  <dd>{formatRupees(money.total)}</dd>
                  <dt>Received</dt>
                  <dd>{formatRupees(paid)}</dd>
                </>
              )}
            </dl>
            <p className={styles.totalDue}>
              <span>{paid > 0 ? (due > 0 ? 'Balance due' : 'Paid') : isTaxInvoice ? 'Total due' : 'Total'}</span>
              <strong>{formatRupees(paid > 0 && due > 0 ? due : money.total)}</strong>
            </p>
          </div>
        </section>

        {showBankDetails && !paidInFull && <PaymentDetails settings={settings} />}

        <DocumentTerms notes={notes} terms={terms} />

        {closingLine && <p className={styles.thanks}>{closingLine}</p>}
        <section className={styles.signatures}>
          {clientAcceptance ? <ClientAcceptance /> : <span />}
          <SignatureBlock companyName={companyName} signatory={signatory} showSeal={showSeal} />
        </section>

        <DocumentFooter settings={settings} />
      </DocumentSheet>
    </div>
  );
}
