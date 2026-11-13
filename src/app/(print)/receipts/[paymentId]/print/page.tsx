import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptPrint } from '@/components/finance/ReceiptPrint';
import { AppLink as Link } from '@/components/ui/AppLink';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getPaymentReceipt } from '@/server/services/followUpService';
import { getSignatory } from '@/server/services/signatureService';

export const metadata: Metadata = { title: 'Payment receipt' };

type ReceiptPrintPageProps = {
  params: Promise<{ paymentId: string }>;
  // sign: "me" signs with your own signature, "none" leaves it to sign by hand;
  // otherwise it is signed as the invoice is. seal: "1" or "0".
  searchParams: Promise<{ sign?: string; seal?: string }>;
};

// Anyone who can see the invoice's payments can print its receipts. It is signed as
// the invoice is, and whoever prepares it can sign it themselves instead.
export default async function ReceiptPrintPage({ params, searchParams }: ReceiptPrintPageProps) {
  const access = await requirePagePermission(permissionKeys.invoicesView);
  const paymentId = parseId((await params).paymentId);
  if (!paymentId) notFound();
  const query = await searchParams;
  const [payment, settings, mine] = await Promise.all([getPaymentReceipt(paymentId), getFinanceSettings(), getSignatory(access.employee.id)]);
  if (!payment || !payment.receipt_number) notFound();

  const canSign =
    (access.permissions[permissionKeys.invoicesManage] !== undefined || access.permissions[permissionKeys.quotationsManage] !== undefined) &&
    Boolean(mine?.signatureImage);
  const sign = query.sign === 'none' ? 'none' : query.sign === 'me' && canSign ? 'me' : 'invoice';
  const signerId = sign === 'none' ? null : sign === 'me' ? access.employee.id : (payment.invoice?.signed_by ?? null);
  const signatory = signerId === access.employee.id ? mine : await getSignatory(signerId);
  const showSeal = query.seal === '1' ? true : query.seal === '0' ? false : (payment.invoice?.show_seal ?? false) || sign === 'me';

  const href = (next: { sign?: string; seal?: boolean }) => {
    const values = new URLSearchParams();
    const nextSign = next.sign ?? (sign === 'invoice' ? undefined : sign);
    if (nextSign) values.set('sign', nextSign);
    values.set('seal', (next.seal ?? showSeal) ? '1' : '0');
    return `/receipts/${paymentId}/print?${values.toString()}`;
  };

  return (
    <ReceiptPrint
      payment={payment}
      settings={settings}
      signatory={signatory}
      showSeal={showSeal}
      toolbarExtra={
        <>
          {canSign && signerId !== access.employee.id && <Link href={href({ sign: 'me' })}>Sign with my signature</Link>}
          {signatory && <Link href={href({ sign: 'none' })}>Remove signature</Link>}
          {signatory?.sealImage && <Link href={href({ seal: !showSeal })}>{showSeal ? 'Hide seal' : 'Add seal'}</Link>}
        </>
      }
    />
  );
}
