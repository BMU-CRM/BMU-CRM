import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintableDocument } from '@/components/finance/PrintableDocument';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getInvoice, listInvoiceItems } from '@/server/services/invoiceService';
import { getSignatory } from '@/server/services/signatureService';

export const metadata: Metadata = { title: 'Print invoice' };

type PrintInvoicePageProps = {
  params: Promise<{ invoiceId: string }>;
};

const stamps = {
  draft: 'Draft. Not a tax invoice',
  issued: undefined,
  partially_paid: undefined,
  paid: 'Paid',
  cancelled: 'Cancelled',
} as const;

export default async function PrintInvoicePage({ params }: PrintInvoicePageProps) {
  await requirePagePermission(permissionKeys.invoicesView);
  const invoiceId = parseId((await params).invoiceId);
  if (!invoiceId) notFound();

  const [invoice, items, settings] = await Promise.all([getInvoice(invoiceId), listInvoiceItems(invoiceId), getFinanceSettings()]);
  if (!invoice) notFound();
  const signatory = await getSignatory(invoice.signed_by);

  const isDraft = invoice.status === 'draft';

  return (
    <PrintableDocument
      heading={isDraft ? 'Invoice' : 'Tax invoice'}
      stamp={stamps[invoice.status]}
      backHref={`/invoices/${invoice.id}`}
      facts={[
        { label: 'Invoice no.', value: invoice.invoice_number ?? 'Given when issued' },
        { label: 'Invoice date', value: formatDate(invoice.issue_date) },
        { label: 'Due date', value: formatDate(invoice.due_date) },
      ]}
      billTo={{ name: invoice.bill_to_name, address: invoice.bill_to_address, gstin: invoice.client_gstin }}
      placeOfSupply={invoice.place_of_supply}
      settings={settings}
      lines={items}
      money={invoice}
      notes={invoice.notes}
      terms={invoice.terms}
      showBankDetails={invoice.status !== 'cancelled' && invoice.status !== 'paid'}
      isTaxInvoice={!isDraft}
      signatory={signatory}
      showSeal={invoice.show_seal}
      closingLine="Thank you for your business"
    />
  );
}
