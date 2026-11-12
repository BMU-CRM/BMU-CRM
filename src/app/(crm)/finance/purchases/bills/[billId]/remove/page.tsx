import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ReasonForm } from '@/components/ui/ReasonForm';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { parseId } from '@/lib/parseListParams';
import { removeVendorBillAction } from '@/server/actions/purchaseActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getVendorBill } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Remove bill' };

export default async function RemoveBillPage({ params }: { params: Promise<{ billId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const billId = parseId((await params).billId);
  if (!billId) notFound();
  const bill = await getVendorBill(billId);
  if (!bill || bill.deleted_at || bill.amount_paid > 0) notFound();
  return (
    <>
      <PageHeader title={`Remove bill ${bill.bill_number}`} description={`${bill.vendor?.name}, ${formatRupees(bill.amount)}. It is kept, marked as removed.`} />
      <Panel>
        <ReasonForm
          action={removeVendorBillAction.bind(null, bill.id)}
          label="Why is it being removed?"
          hint="Only for a bill entered by mistake. It stays on record with this reason."
          submitLabel="Remove bill"
          backHref={`/finance/purchases/bills/${bill.id}`}
        />
      </Panel>
    </>
  );
}
