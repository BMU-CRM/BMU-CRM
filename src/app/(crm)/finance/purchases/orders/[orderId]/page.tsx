import { Pencil, Plus, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentLines } from '@/components/finance/DocumentLines';
import { PurchaseOrderStatusBadge } from '@/components/purchases/PurchaseBadges';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { stateCode } from '@/lib/finance/indianStates';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { deleteDraftOrderAction, issuePurchaseOrderAction, markOrderReceivedAction } from '@/server/actions/purchaseActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getPurchaseOrder, listPurchaseOrderItems } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Purchase order' };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const orderId = parseId((await params).orderId);
  if (!orderId) notFound();
  const [order, items] = await Promise.all([getPurchaseOrder(orderId), listPurchaseOrderItems(orderId)]);
  if (!order) notFound();

  const status = order.status;
  const place = order.place_of_supply;

  return (
    <>
      <PageHeader
        title={order.title}
        description={`${order.po_number ?? 'Draft order'} · ${order.vendor?.name ?? 'Vendor'} · ${formatDate(order.order_date)}`}
        actions={
          <>
            {status === 'draft' && (
              <>
                <ConfirmActionButton
                  label="Issue order"
                  variant="primary"
                  title="Issue this purchase order?"
                  description="It gets the next order number and can no longer be changed. If something is wrong later, cancel it and raise a new one."
                  confirmLabel="Issue order"
                  action={issuePurchaseOrderAction.bind(null, order.id)}
                />
                <ButtonLink href={`/finance/purchases/orders/${order.id}/edit`}>
                  <Pencil size={16} aria-hidden="true" />
                  Edit
                </ButtonLink>
              </>
            )}
            {status === 'issued' && (
              <ConfirmActionButton
                label="Mark as received"
                variant="primary"
                title="Mark this order as received?"
                description="Use this once the goods or services have arrived."
                confirmLabel="Mark as received"
                action={markOrderReceivedAction.bind(null, order.id)}
              />
            )}
            {(status === 'issued' || status === 'received') && (
              <ButtonLink href={`/finance/purchases/bills/new?vendor=${order.vendor_id}&order=${order.id}`}>
                <Plus size={16} aria-hidden="true" />
                Add bill
              </ButtonLink>
            )}
            <ButtonLink href={`/purchase-orders/${order.id}/print`}>
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
            {status === 'draft' && (
              <ConfirmActionButton
                label="Delete"
                title="Delete this draft order?"
                description="It has no number yet, so nothing is lost from the numbering. This cannot be undone."
                confirmLabel="Delete order"
                variant="danger"
                action={deleteDraftOrderAction.bind(null, order.id)}
              />
            )}
            {status === 'issued' && (
              <ButtonLink href={`/finance/purchases/orders/${order.id}/cancel`} variant="ghost">
                Cancel order
              </ButtonLink>
            )}
          </>
        }
      />
      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel title="Items" action={<PurchaseOrderStatusBadge status={status} />} flush>
            <DocumentLines lines={items} money={order} />
          </Panel>
          {status === 'cancelled' && (
            <Panel title="Cancelled" description={order.cancelled_at ? formatDateTime(order.cancelled_at) : undefined}>
              <p className={layout.text}>{order.cancel_reason}</p>
            </Panel>
          )}
          {(order.notes || order.terms) && (
            <Panel title="Notes and terms">
              {order.notes && <p className={layout.text}>{order.notes}</p>}
              {order.terms && <p className={`${layout.text} ${layout.muted} ${order.notes ? layout.spaced : ''}`}>{order.terms}</p>}
            </Panel>
          )}
        </div>
        <Panel title="Details">
          <dl className={layout.factsStacked}>
            <div>
              <dt>Vendor</dt>
              <dd>
                {order.vendor ? (
                  <Link href={`/finance/purchases/vendors/${order.vendor.id}`} className={layout.link}>
                    {order.vendor.name}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Vendor GSTIN</dt>
              <dd>{order.vendor?.gstin ?? 'Unregistered'}</dd>
            </div>
            <div>
              <dt>Place of supply</dt>
              <dd>{place ? `${place}${stateCode(place) ? ` (${stateCode(place)})` : ''}` : 'Not set'}</dd>
            </div>
            <div>
              <dt>Expected by</dt>
              <dd>{order.expected_date ? formatDate(order.expected_date) : 'Not set'}</dd>
            </div>
            {order.delivery_address && (
              <div>
                <dt>Deliver to</dt>
                <dd className={layout.text}>{order.delivery_address}</dd>
              </div>
            )}
            <div>
              <dt>Raised by</dt>
              <dd>{order.author?.full_name ?? 'Former employee'}</dd>
            </div>
            {order.issued_at && (
              <div>
                <dt>Issued</dt>
                <dd>{formatDateTime(order.issued_at)}</dd>
              </div>
            )}
          </dl>
        </Panel>
      </div>
    </>
  );
}
