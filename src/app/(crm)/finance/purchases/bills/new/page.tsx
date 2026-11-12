import { Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { VendorBillForm } from '@/components/purchases/PurchaseForms';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getBillOptions } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Add bill' };

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ vendor?: string; order?: string }> }) {
  const access = await requirePagePermission(permissionKeys.purchasesManage);
  const query = await searchParams;
  const options = await getBillOptions(access);
  const vendorId = parseId(query.vendor);
  const orderId = parseId(query.order);

  return (
    <>
      <PageHeader title="Add bill" description="A bill a vendor sent you. Record payments against it from the bill's page." />
      <Panel>
        {options.vendors.length === 0 ? (
          <EmptyState icon={Truck} title="Add a vendor first" description="Bills are recorded against a vendor." action={<ButtonLink href="/finance/purchases/vendors/new" variant="primary">Add vendor</ButtonLink>} />
        ) : (
          <VendorBillForm
            options={options}
            defaultVendorId={options.vendors.some((vendor) => vendor.value === vendorId) ? vendorId : undefined}
            defaultOrderId={options.orders.some((order) => order.value === orderId) ? orderId : undefined}
            today={todayInIndia()}
          />
        )}
      </Panel>
    </>
  );
}
