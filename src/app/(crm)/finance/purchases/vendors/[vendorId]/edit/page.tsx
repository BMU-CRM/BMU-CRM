import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VendorForm } from '@/components/purchases/PurchaseForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getVendor } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Edit vendor' };

export default async function EditVendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const vendorId = parseId((await params).vendorId);
  if (!vendorId) notFound();
  const vendor = await getVendor(vendorId);
  if (!vendor) notFound();
  return (
    <>
      <PageHeader title={`Edit ${vendor.name}`} />
      <Panel>
        <VendorForm vendor={vendor} />
      </Panel>
    </>
  );
}
