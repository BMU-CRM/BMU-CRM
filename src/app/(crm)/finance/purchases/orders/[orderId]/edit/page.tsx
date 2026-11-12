import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PurchaseOrderForm } from '@/components/purchases/PurchaseForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getPurchaseOrder, getVendorOptions, listPurchaseOrderItems } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Edit purchase order' };

// Only drafts can be edited. An issued order is cancelled and raised again.
export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const orderId = parseId((await params).orderId);
  if (!orderId) notFound();
  const [order, items, settings] = await Promise.all([getPurchaseOrder(orderId), listPurchaseOrderItems(orderId), getFinanceSettings()]);
  if (!order || order.status !== 'draft') notFound();
  const vendors = await getVendorOptions(order.vendor_id);

  return (
    <>
      <PageHeader title="Edit draft purchase order" description={order.title} />
      <PurchaseOrderForm
        order={order}
        items={items.map((item) => ({
          description: item.description,
          hsnSac: item.hsn_sac ?? '',
          quantity: String(item.quantity),
          unitPrice: String(item.unit_price),
          taxRate: String(item.tax_rate),
        }))}
        vendors={vendors}
        companyState={settings?.state ?? null}
        defaultTaxRate={settings?.default_tax_rate ?? 18}
        today={todayInIndia()}
      />
    </>
  );
}
