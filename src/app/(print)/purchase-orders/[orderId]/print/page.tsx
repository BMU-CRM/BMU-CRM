import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintableDocument } from '@/components/finance/PrintableDocument';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getPurchaseOrder, listPurchaseOrderItems } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Print purchase order' };

const stamps = { draft: 'Draft', issued: undefined, received: 'Received', cancelled: 'Cancelled' } as const;

export default async function PrintPurchaseOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const orderId = parseId((await params).orderId);
  if (!orderId) notFound();
  const [order, items, settings] = await Promise.all([getPurchaseOrder(orderId), listPurchaseOrderItems(orderId), getFinanceSettings()]);
  if (!order) notFound();

  return (
    <PrintableDocument
      heading="Purchase order"
      stamp={stamps[order.status]}
      backHref={`/finance/purchases/orders/${order.id}`}
      facts={[
        { label: 'PO no.', value: order.po_number ?? 'Given when issued' },
        { label: 'Order date', value: formatDate(order.order_date) },
        ...(order.expected_date ? [{ label: 'Expected by', value: formatDate(order.expected_date) }] : []),
      ]}
      partyLabel="Vendor"
      billTo={{ name: order.vendor?.name ?? null, address: order.vendor?.address ?? null, gstin: order.vendor?.gstin ?? null }}
      placeOfSupply={order.place_of_supply}
      settings={settings}
      lines={items}
      money={order}
      notes={[order.delivery_address && `Deliver to: ${order.delivery_address}`, order.notes].filter(Boolean).join('\n\n') || null}
      terms={order.terms}
      showBankDetails={false}
      isTaxInvoice={false}
    />
  );
}
