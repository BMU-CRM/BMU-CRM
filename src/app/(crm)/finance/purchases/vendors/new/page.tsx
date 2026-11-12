import type { Metadata } from 'next';
import { VendorForm } from '@/components/purchases/PurchaseForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add vendor' };

export default async function NewVendorPage() {
  await requirePagePermission(permissionKeys.purchasesManage);
  return (
    <>
      <PageHeader title="Add vendor" description="A company or person you buy from." />
      <Panel>
        <VendorForm />
      </Panel>
    </>
  );
}
