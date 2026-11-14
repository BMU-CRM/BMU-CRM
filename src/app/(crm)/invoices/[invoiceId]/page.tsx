import { Pencil, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { CancelInvoiceButton } from '@/components/finance/CancelInvoiceButton';
import { DocumentLines } from '@/components/finance/DocumentLines';
import { InvoiceStatusBadge } from '@/components/finance/FinanceBadges';
import { FinanceLiveRefresh } from '@/components/finance/FinanceLiveRefresh';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { SelectField, TextField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { stateCode } from '@/lib/finance/indianStates';
import { balanceDue, isUnpaid } from '@/lib/finance/invoiceDue';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { paymentMethodLabels } from '@/lib/validation/financeSchema';
import {
  deleteInvoiceAction,
  issueInvoiceAction,
  markInvoiceSentAction,
  recordPaymentAction,
  removePaymentAction,
} from '@/server/actions/invoiceActions';
import { requirePagePermission } from '@/server/services/accessService';
import { hasFinanceReach } from '@/server/services/financeService';
import { getInvoice, listInvoiceItems, listInvoicePayments } from '@/server/services/invoiceService';

export const metadata: Metadata = { title: 'Invoice' };

const methodOptions = Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }));

type InvoicePageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoicePage({ params }: InvoicePageProps) {
  const access = await requirePagePermission(permissionKeys.invoicesView);
  const invoiceId = parseId((await params).invoiceId);
  if (!invoiceId) notFound();

  const [invoice, items, payments] = await Promise.all([
    getInvoice(invoiceId),
    listInvoiceItems(invoiceId),
    listInvoicePayments(invoiceId),
  ]);
  if (!invoice) notFound();

  // The buttons offered match guard_invoice_write, which has the final say.
  const canManage = hasFinanceReach(access, permissionKeys.invoicesManage, invoice);
  const canRecord = access.permissions[permissionKeys.paymentsRecord] !== undefined;
  const canOpenClient = access.permissions[permissionKeys.clientsView] !== undefined;
  const status = invoice.status;
  const stillDue = balanceDue(invoice);
  const place = invoice.place_of_supply;

  return (
    <>
      <FinanceLiveRefresh table="invoices" id={invoice.id} />
      <PageHeader
        title={invoice.title}
        description={`${invoice.invoice_number ?? 'Draft invoice'} · ${invoice.client?.company_name ?? 'Unknown client'} · ${formatDate(invoice.issue_date)}`}
        actions={
          <>
            {canManage && status === 'draft' && (
              <>
                <ConfirmActionButton
                  label="Issue invoice"
                  variant="primary"
                  title="Issue this invoice?"
                  description="It gets the next invoice number and can no longer be changed. If something is wrong later, you cancel it and issue a new one."
                  confirmLabel="Issue invoice"
                  action={issueInvoiceAction.bind(null, invoice.id)}
                />
                <ButtonLink href={`/invoices/${invoice.id}/edit`}>
                  <Pencil size={16} aria-hidden="true" />
                  Edit
                </ButtonLink>
              </>
            )}
            {/* Sending is recorded on its own, after the invoice is issued. */}
            {canManage && status !== 'draft' && status !== 'cancelled' && !invoice.sent_at && (
              <ActionButton label="Mark as sent" variant="secondary" action={markInvoiceSentAction.bind(null, invoice.id, true)} />
            )}
            {canManage && status !== 'draft' && status !== 'cancelled' && invoice.sent_at && (
              <ActionButton label="Not sent yet" action={markInvoiceSentAction.bind(null, invoice.id, false)} />
            )}
            <ButtonLink href={`/invoices/${invoice.id}/print`}>
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
            {canManage && status === 'draft' && (
              <ConfirmActionButton
                label="Delete"
                title="Delete this draft invoice?"
                description="It has no number yet, so nothing is lost from the numbering. This cannot be undone."
                confirmLabel="Delete invoice"
                action={deleteInvoiceAction.bind(null, invoice.id)}
              />
            )}
            {canManage && isUnpaid(status) && invoice.amount_paid === 0 && <CancelInvoiceButton invoiceId={invoice.id} />}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel
            title="Items"
            action={
              <div className={layout.badges}>
                <InvoiceStatusBadge status={status} dueDate={invoice.due_date} />
              </div>
            }
            flush
          >
            <DocumentLines lines={items} money={invoice} />
          </Panel>

          {status === 'cancelled' && (
            <Panel title="Cancelled" description={invoice.cancelled_at ? formatDateTime(invoice.cancelled_at) : undefined}>
              <p className={layout.text}>{invoice.cancel_reason}</p>
            </Panel>
          )}

          {status !== 'draft' && (
            <Panel
              title="Payments"
              description={status === 'cancelled' ? undefined : `${formatRupees(invoice.amount_paid)} received, ${formatRupees(stillDue)} still due`}
              flush
            >
              {payments.length === 0 ? (
                <p className={layout.emptyText}>No payments recorded yet.</p>
              ) : (
                <ul className={layout.list}>
                  {payments.map((payment) => (
                    <li key={payment.id} className={layout.row}>
                      <div className={layout.rowMain}>
                        <p>
                          <span className={layout.rowTitle}>{formatRupees(payment.amount)}</span>{' '}
                          <span className={layout.muted}>
                            {paymentMethodLabels[payment.method]} on {formatDate(payment.payment_date)}
                          </span>
                        </p>
                        <p className={layout.muted}>
                          {[payment.reference, payment.notes, `Recorded by ${payment.recorder?.full_name ?? 'a former employee'}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {payment.receipt_number && (
                        <Link href={`/receipts/${payment.id}/print`} className={layout.link}>
                          Receipt {payment.receipt_number}
                        </Link>
                      )}
                      {canRecord && (
                        <ConfirmActionButton
                          label="Remove"
                          title="Remove this payment?"
                          description="Only do this if it was entered by mistake. The invoice goes back to showing the amount as owed."
                          confirmLabel="Remove payment"
                          action={removePaymentAction.bind(null, invoice.id, payment.id)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canRecord && isUnpaid(status) && (
                <div className={layout.sectionForm}>
                  <InlineActionForm action={recordPaymentAction.bind(null, invoice.id)} submitLabel="Record payment">
                    <TextField label="Amount (₹)" name="amount" inputMode="decimal" defaultValue={String(stillDue)} required />
                    <TextField label="Received on" name="paymentDate" type="date" defaultValue={todayInIndia()} max={todayInIndia()} required />
                    <SelectField label="How" name="method" options={methodOptions} defaultValue="bank_transfer" />
                    <TextField label="Reference" name="reference" placeholder="UTR, cheque number…" />
                  </InlineActionForm>
                </div>
              )}
            </Panel>
          )}

          {(invoice.notes || invoice.terms) && (
            <Panel title="Notes and terms">
              {invoice.notes && <p className={layout.text}>{invoice.notes}</p>}
              {invoice.terms && <p className={`${layout.text} ${layout.muted} ${invoice.notes ? layout.spaced : ''}`}>{invoice.terms}</p>}
            </Panel>
          )}
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Client</dt>
                <dd>
                  {invoice.client && canOpenClient ? (
                    <Link href={`/clients/${invoice.client.id}`} className={layout.link}>
                      {invoice.client.company_name}
                    </Link>
                  ) : (
                    (invoice.client?.company_name ?? 'Unknown client')
                  )}
                </dd>
              </div>
              {invoice.project && (
                <div>
                  <dt>Project</dt>
                  <dd>
                    <Link href={`/projects/${invoice.project.id}`} className={layout.link}>
                      {invoice.project.name}
                    </Link>
                  </dd>
                </div>
              )}
              {invoice.quotation && (
                <div>
                  <dt>From quotation</dt>
                  <dd>
                    <Link href={`/quotations/${invoice.quotation.id}`} className={layout.link}>
                      {invoice.quotation.quotation_number}
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt>Bill to</dt>
                <dd className={layout.text}>
                  {invoice.bill_to_name}
                  {invoice.bill_to_address ? `\n${invoice.bill_to_address}` : ''}
                </dd>
              </div>
              <div>
                <dt>Client GSTIN</dt>
                <dd>{invoice.client_gstin ?? 'Not registered'}</dd>
              </div>
              <div>
                <dt>Place of supply</dt>
                <dd>{place ? `${place}${stateCode(place) ? ` (${stateCode(place)})` : ''}` : 'Not set'}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatDate(invoice.due_date)}</dd>
              </div>
              <div>
                <dt>Prepared by</dt>
                <dd>{invoice.author?.full_name ?? 'Former employee'}</dd>
              </div>
              {invoice.issued_at && (
                <div>
                  <dt>Issued</dt>
                  <dd>{formatDateTime(invoice.issued_at)}</dd>
                </div>
              )}
              {invoice.sent_at && (
                <div>
                  <dt>Sent to the client</dt>
                  <dd>{formatDateTime(invoice.sent_at)}</dd>
                </div>
              )}
              {invoice.paid_at && (
                <div>
                  <dt>Paid in full</dt>
                  <dd>{formatDateTime(invoice.paid_at)}</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
