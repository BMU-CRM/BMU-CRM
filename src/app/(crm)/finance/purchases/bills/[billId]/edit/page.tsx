import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VendorBillForm } from '@/components/purchases/PurchaseForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getBillOptions, getVendorBill } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Edit bill' };

export default async function EditBillPage({ params }: { params: Promise<{ billId: string }> }) {
  const access = await requirePagePermission(permissionKeys.purchasesManage);
  const billId = parseId((await params).billId);
  if (!billId) notFound();
  const bill = await getVendorBill(billId);
  if (!bill || bill.deleted_at) notFound();
  const options = await getBillOptions(access, { vendorId: bill.vendor_id, categoryId: bill.category_id });
  // Keep a linked order or file that would not otherwise be offered.
  if (bill.order && !options.orders.some((order) => order.value === bill.order!.id)) {
    options.orders.push({ value: bill.order.id, label: `${bill.order.po_number ?? 'Draft'} · ${bill.order.title}`, vendorId: bill.vendor_id });
  }
  if (bill.file && !options.files.some((file) => file.value === bill.file!.id)) options.files.push({ value: bill.file.id, label: bill.file.name });

  return (
    <>
      <PageHeader title={`Edit bill ${bill.bill_number}`} description={bill.vendor?.name} />
      <Panel>
        <VendorBillForm bill={bill} options={options} today={todayInIndia()} />
      </Panel>
    </>
  );
}
