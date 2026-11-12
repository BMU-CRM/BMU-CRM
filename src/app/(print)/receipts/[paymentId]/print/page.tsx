import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptPrint } from '@/components/finance/ReceiptPrint';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getPaymentReceipt } from '@/server/services/followUpService';

export const metadata: Metadata = { title: 'Payment receipt' };

// Anyone who can see the invoice's payments can print its receipts.
export default async function ReceiptPrintPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await requirePagePermission(permissionKeys.invoicesView);
  const paymentId = parseId((await params).paymentId);
  if (!paymentId) notFound();
  const [payment, settings] = await Promise.all([getPaymentReceipt(paymentId), getFinanceSettings()]);
  if (!payment || !payment.receipt_number) notFound();
  return <ReceiptPrint payment={payment} settings={settings} />;
}
