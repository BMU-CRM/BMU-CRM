import type { Metadata } from 'next';
import { PurchaseOrderForm } from '@/components/purchases/PurchaseForms';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Truck } from 'lucide-react';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getVendorOptions } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const [vendors, settings] = await Promise.all([getVendorOptions(), getFinanceSettings()]);
  const vendorId = parseId((await searchParams).vendor);

  return (
    <>
      <PageHeader title="New purchase order" description="Saved as a draft. It gets its number when you issue it." />
      {vendors.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Truck}
            title="Add a vendor first"
            description="Purchase orders are raised to a vendor."
            action={<ButtonLink href="/finance/purchases/vendors/new" variant="primary">Add vendor</ButtonLink>}
          />
        </Panel>
      ) : (
        <PurchaseOrderForm
          vendors={vendors}
          defaultVendorId={vendors.some((vendor) => vendor.value === vendorId) ? vendorId : undefined}
          companyState={settings?.state ?? null}
          defaultTaxRate={settings?.default_tax_rate ?? 18}
          today={todayInIndia()}
        />
      )}
    </>
  );
}
