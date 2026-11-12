import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ReasonForm } from '@/components/ui/ReasonForm';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { cancelPurchaseOrderAction } from '@/server/actions/purchaseActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getPurchaseOrder } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Cancel purchase order' };

export default async function CancelPurchaseOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const orderId = parseId((await params).orderId);
  if (!orderId) notFound();
  const order = await getPurchaseOrder(orderId);
  if (!order || (order.status !== 'draft' && order.status !== 'issued')) notFound();
  return (
    <>
      <PageHeader title={`Cancel ${order.po_number ?? 'draft order'}`} description={`${order.title}, to ${order.vendor?.name}. Its number stays used.`} />
      <Panel>
        <ReasonForm
          action={cancelPurchaseOrderAction.bind(null, order.id)}
          label="Why is it being cancelled?"
          hint="It stays on record, marked as cancelled, with this reason."
          submitLabel="Cancel order"
          backHref={`/finance/purchases/orders/${order.id}`}
        />
      </Panel>
    </>
  );
}
