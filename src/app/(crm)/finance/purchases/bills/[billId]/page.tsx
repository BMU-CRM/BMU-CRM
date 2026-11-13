import { Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { VendorBillStatusBadge } from '@/components/purchases/PurchaseBadges';
import { BillPaymentForm } from '@/components/purchases/PurchaseForms';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayingAccountOptions } from '@/server/services/ledgerService';
import { getVendorBill, listBillPayments } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Vendor bill' };

export default async function VendorBillPage({ params }: { params: Promise<{ billId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const billId = parseId((await params).billId);
  if (!billId) notFound();
  const [bill, payments, { accounts, defaultAccountId }] = await Promise.all([getVendorBill(billId), listBillPayments(billId), getPayingAccountOptions()]);
  if (!bill) notFound();

  const today = todayInIndia();
  const stillDue = Math.round((bill.amount - bill.amount_paid) * 100) / 100;
  const removed = Boolean(bill.deleted_at);

  return (
    <>
      <PageHeader
        title={`${bill.vendor?.name ?? 'Vendor'}: bill ${bill.bill_number}`}
        description={`Dated ${formatDate(bill.bill_date)}, due ${formatDate(bill.due_date)}${bill.category ? ` · filed under ${bill.category.name}` : ''}`}
        actions={
          !removed && (
            <>
              <ButtonLink href={`/finance/purchases/bills/${bill.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
              {bill.amount_paid === 0 && (
                <ButtonLink href={`/finance/purchases/bills/${bill.id}/remove`} variant="ghost">
                  Remove
                </ButtonLink>
              )}
            </>
          )
        }
      />
      <div className={layout.stack}>
        {removed ? (
          <Panel title="Removed" description={bill.deleted_at ? formatDateTime(bill.deleted_at) : undefined}>
            <p className={layout.text}>{bill.delete_reason}</p>
          </Panel>
        ) : (
          <div className={layout.badges}>
            <VendorBillStatusBadge amount={bill.amount} paid={bill.amount_paid} dueDate={bill.due_date} today={today} />
          </div>
        )}
        <StatTiles
          tiles={[
            { label: 'Bill total', value: formatRupees(bill.amount) },
            { label: 'Paid', value: formatRupees(bill.amount_paid) },
            { label: 'Still due', value: formatRupees(stillDue) },
          ]}
        />
        <div className={layout.columns}>
          <div className={layout.stack}>
            {!removed && stillDue > 0 && (
              <Panel title="Record a payment" description="It is filed as an expense under the bill's category, against the account you choose.">
                {accounts.length === 0 ? (
                  <p className={layout.emptyText}>Add a bank account first, in Bank accounts.</p>
                ) : (
                  <BillPaymentForm billId={bill.id} stillDue={stillDue} accounts={accounts} defaultAccountId={defaultAccountId} today={today} />
                )}
              </Panel>
            )}
            <Panel title="Payments" flush>
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
                            {paymentMethodLabels[payment.method]} on {formatDate(payment.paid_on)} from {payment.account?.name}
                          </span>
                        </p>
                        <p className={layout.muted}>
                          {[payment.reference, `Recorded by ${payment.payer?.full_name ?? 'a former employee'}`].filter(Boolean).join(' · ')}
                        </p>
                        {payment.deleted_at && <p className={layout.muted}>Removed: {payment.delete_reason}</p>}
                      </div>
                      {!payment.deleted_at && (
                        <ButtonLink href={`/finance/purchases/bills/${bill.id}/payments/${payment.id}/remove`} variant="ghost">
                          Remove
                        </ButtonLink>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Vendor</dt>
                <dd>
                  {bill.vendor ? (
                    <Link href={`/finance/purchases/vendors/${bill.vendor.id}`} className={layout.link}>
                      {bill.vendor.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              {bill.order && (
                <div>
                  <dt>Purchase order</dt>
                  <dd>
                    <Link href={`/finance/purchases/orders/${bill.order.id}`} className={layout.link}>
                      {bill.order.po_number ?? 'Draft'} · {bill.order.title}
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt>GST in the bill</dt>
                <dd>{formatRupees(bill.tax_amount)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{bill.department?.name ?? 'Not for one department'}</dd>
              </div>
              <div>
                <dt>Bill file</dt>
                <dd>
                  {bill.file ? (
                    <Link href={`/files/${bill.file.id}`} className={layout.link}>
                      {bill.file.name}
                    </Link>
                  ) : (
                    'None attached'
                  )}
                </dd>
              </div>
              {bill.description && (
                <div>
                  <dt>Description</dt>
                  <dd className={layout.text}>{bill.description}</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
