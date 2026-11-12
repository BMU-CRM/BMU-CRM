import { Pencil, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PurchaseOrderStatusBadge, VendorBillStatusBadge } from '@/components/purchases/PurchaseBadges';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { deleteVendorAction } from '@/server/actions/purchaseActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getVendor, getVendorHistory } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Vendor' };

export default async function VendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const vendorId = parseId((await params).vendorId);
  if (!vendorId) notFound();
  const [vendor, history] = await Promise.all([getVendor(vendorId), getVendorHistory(vendorId)]);
  if (!vendor) notFound();

  const today = todayInIndia();
  const billed = history.bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const paid = history.bills.reduce((sum, bill) => sum + Number(bill.amount_paid), 0);
  const unused = history.orders.length === 0 && history.bills.length === 0;

  return (
    <>
      <PageHeader
        title={vendor.name}
        description={[vendor.state, vendor.gstin ? `GSTIN ${vendor.gstin}` : 'Unregistered for GST', `pays within ${vendor.payment_terms_days} days`].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink href={`/finance/purchases/bills/new?vendor=${vendor.id}`} variant="primary">
              <Plus size={16} aria-hidden="true" />
              Add bill
            </ButtonLink>
            <ButtonLink href={`/finance/purchases/orders/new?vendor=${vendor.id}`}>New purchase order</ButtonLink>
            <ButtonLink href={`/finance/purchases/vendors/${vendor.id}/edit`}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </ButtonLink>
            {unused && (
              <ConfirmActionButton
                label="Delete"
                title={`Delete ${vendor.name}?`}
                description="It has no orders or bills, so nothing else is affected. This cannot be undone."
                confirmLabel="Delete vendor"
                variant="danger"
                action={deleteVendorAction.bind(null, vendor.id)}
              />
            )}
          </>
        }
      />
      <div className={layout.stack}>
        {!vendor.is_active && <StatusBadge>Not in use</StatusBadge>}
        <StatTiles
          tiles={[
            { label: 'Billed', value: formatRupees(billed) },
            { label: 'Paid', value: formatRupees(paid) },
            { label: 'Still to pay', value: formatRupees(billed - paid) },
          ]}
        />
        <div className={layout.columns}>
          <Panel title="Bills" flush>
            {history.bills.length === 0 ? (
              <p className={layout.emptyText}>No bills yet.</p>
            ) : (
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Bill</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={tableStyles.numeric}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.bills.map((bill) => (
                      <tr key={bill.id}>
                        <td>
                          <Link href={`/finance/purchases/bills/${bill.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {bill.bill_number}
                          </Link>
                          <p className={tableStyles.secondaryText}>
                            {formatDate(bill.bill_date)}, due {formatDate(bill.due_date)}
                          </p>
                        </td>
                        <td>
                          <VendorBillStatusBadge amount={bill.amount} paid={bill.amount_paid} dueDate={bill.due_date} today={today} />
                        </td>
                        <td className={tableStyles.numeric}>{formatRupees(bill.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <div className={layout.stack}>
            <Panel title="Purchase orders" flush>
              {history.orders.length === 0 ? (
                <p className={layout.emptyText}>No orders yet.</p>
              ) : (
                <ul className={layout.list}>
                  {history.orders.map((order) => (
                    <li key={order.id} className={layout.row}>
                      <div className={layout.rowMain}>
                        <Link href={`/finance/purchases/orders/${order.id}`} className={layout.rowTitle}>
                          {order.title}
                        </Link>
                        <p className={layout.muted}>
                          {order.po_number ?? 'Draft'} · {formatDate(order.order_date)} · {formatRupees(order.total)}
                        </p>
                      </div>
                      <PurchaseOrderStatusBadge status={order.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Contact">
              <dl className={layout.factsStacked}>
                <div>
                  <dt>Contact person</dt>
                  <dd>{vendor.contact_person ?? '—'}</dd>
                </div>
                <div>
                  <dt>Phone and email</dt>
                  <dd>{[vendor.phone, vendor.email].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd className={layout.text}>{vendor.address ?? '—'}</dd>
                </div>
                {vendor.notes && (
                  <div>
                    <dt>Notes</dt>
                    <dd className={layout.text}>{vendor.notes}</dd>
                  </div>
                )}
              </dl>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
