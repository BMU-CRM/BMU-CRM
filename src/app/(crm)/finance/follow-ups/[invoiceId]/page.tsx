import { Printer } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { FollowUpForm } from '@/components/finance/FollowUpForms';
import { FollowUpStatusBadge } from '@/components/finance/FollowUpStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { balanceDue, isUnpaid } from '@/lib/finance/invoiceDue';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { paymentMethodLabels } from '@/lib/validation/financeSchema';
import { followUpStatusLabels } from '@/lib/validation/followUpSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listInvoiceFollowUps } from '@/server/services/followUpService';
import { getInvoice, listInvoicePayments } from '@/server/services/invoiceService';

export const metadata: Metadata = { title: 'Follow-up' };

export default async function InvoiceFollowUpPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  await requirePagePermission(permissionKeys.followupsManage);
  const invoiceId = parseId((await params).invoiceId);
  if (!invoiceId) notFound();
  const [invoice, followUps, payments] = await Promise.all([getInvoice(invoiceId), listInvoiceFollowUps(invoiceId), listInvoicePayments(invoiceId)]);
  if (!invoice || invoice.status === 'draft') notFound();

  const today = todayInIndia();
  const stillDue = balanceDue(invoice);
  const latest = followUps[0];
  const status = invoice.status === 'paid' ? 'payment_received' : (latest?.status ?? 'not_contacted');
  const overdueDays = Math.max(0, Math.round((Date.parse(today) - Date.parse(invoice.due_date)) / 86_400_000));

  return (
    <>
      <PageHeader
        title={`${invoice.client?.company_name ?? 'Client'}: ${formatRupees(stillDue)} due`}
        description={`${invoice.invoice_number} · ${invoice.title} · due ${formatDate(invoice.due_date)}${overdueDays > 0 && isUnpaid(invoice.status) ? `, ${overdueDays} days overdue` : ''}`}
        actions={
          <>
            <ButtonLink href={`/invoices/${invoice.id}`}>Open invoice</ButtonLink>
            <ButtonLink href={`/invoices/${invoice.id}/print`}>
              <Printer size={16} aria-hidden="true" />
              Print invoice
            </ButtonLink>
          </>
        }
      />
      <div className={layout.columns}>
        <div className={layout.stack}>
          {isUnpaid(invoice.status) && (
            <Panel title="Record a follow-up" description="Each one is kept, so the history shows every conversation.">
              <FollowUpForm invoiceId={invoice.id} today={today} balance={stillDue} />
            </Panel>
          )}
          <Panel title="Follow-up history" action={<FollowUpStatusBadge status={status} />} flush>
            {followUps.length === 0 ? (
              <p className={layout.emptyText}>Nobody has followed up on this invoice yet.</p>
            ) : (
              <ul className={layout.list}>
                {followUps.map((entry) => (
                  <li key={entry.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <p>
                        <span className={layout.rowTitle}>{followUpStatusLabels[entry.status]}</span>{' '}
                        <span className={layout.muted}>
                          {formatDate(entry.contacted_on)} by {entry.author?.full_name ?? 'a former employee'}
                        </span>
                      </p>
                      <p className={layout.text}>{entry.note}</p>
                      <p className={layout.muted}>
                        {[
                          entry.promised_on && `Promised ${entry.promised_amount ? formatRupees(entry.promised_amount) : 'payment'} by ${formatDate(entry.promised_on)}`,
                          entry.next_follow_up_on && `Next follow-up ${formatDate(entry.next_follow_up_on)}`,
                          `Recorded ${formatDateTime(entry.created_at)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className={layout.stack}>
          <Panel title="Payments" description={`${formatRupees(invoice.amount_paid)} of ${formatRupees(invoice.total)} received`} flush>
            {payments.length === 0 ? (
              <p className={layout.emptyText}>No payments yet.</p>
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
                    </div>
                    {payment.receipt_number && (
                      <Link href={`/receipts/${payment.id}/print`} className={layout.link}>
                        {payment.receipt_number}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
