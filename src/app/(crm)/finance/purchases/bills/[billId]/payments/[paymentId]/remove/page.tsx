import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ReasonForm } from '@/components/ui/ReasonForm';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { removeBillPaymentAction } from '@/server/actions/purchaseActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getVendorBill, listBillPayments } from '@/server/services/purchaseService';

export const metadata: Metadata = { title: 'Remove payment' };

export default async function RemoveBillPaymentPage({ params }: { params: Promise<{ billId: string; paymentId: string }> }) {
  await requirePagePermission(permissionKeys.purchasesManage);
  const ids = await params;
  const billId = parseId(ids.billId);
  const paymentId = parseId(ids.paymentId);
  if (!billId || !paymentId) notFound();
  const [bill, payments] = await Promise.all([getVendorBill(billId), listBillPayments(billId)]);
  const payment = payments.find((row) => row.id === paymentId);
  if (!bill || !payment || payment.deleted_at) notFound();

  return (
    <>
      <PageHeader
        title={`Remove the ${formatRupees(payment.amount)} payment`}
        description={`Paid ${formatDate(payment.paid_on)} against bill ${bill.bill_number}. The payment and its expense are kept, marked as removed, and the bill shows the amount as owed again.`}
      />
      <Panel>
        <ReasonForm
          action={removeBillPaymentAction.bind(null, bill.id, payment.id)}
          label="Why is it being removed?"
          hint="Only for a payment entered by mistake."
          submitLabel="Remove payment"
          backHref={`/finance/purchases/bills/${bill.id}`}
        />
      </Panel>
    </>
  );
}
