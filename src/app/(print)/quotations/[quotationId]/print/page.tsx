import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintableDocument } from '@/components/finance/PrintableDocument';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getQuotation, listQuotationItems } from '@/server/services/quotationService';

export const metadata: Metadata = { title: 'Print quotation' };

type PrintQuotationPageProps = {
  params: Promise<{ quotationId: string }>;
};

export default async function PrintQuotationPage({ params }: PrintQuotationPageProps) {
  await requirePagePermission(permissionKeys.quotationsView);
  const quotationId = parseId((await params).quotationId);
  if (!quotationId) notFound();

  const [quotation, items, settings] = await Promise.all([
    getQuotation(quotationId),
    listQuotationItems(quotationId),
    getFinanceSettings(),
  ]);
  if (!quotation) notFound();

  return (
    <PrintableDocument
      heading="Quotation"
      stamp={quotation.status === 'draft' ? 'Draft' : undefined}
      backHref={`/quotations/${quotation.id}`}
      facts={[
        { label: 'Quotation no.', value: quotation.quotation_number },
        { label: 'Date', value: formatDate(quotation.issue_date) },
        { label: 'Valid until', value: formatDate(quotation.valid_until) },
      ]}
      billTo={{ name: quotation.bill_to_name, address: quotation.bill_to_address, gstin: quotation.client_gstin }}
      placeOfSupply={quotation.place_of_supply}
      settings={settings}
      lines={items}
      money={quotation}
      notes={quotation.notes}
      terms={quotation.terms}
      showBankDetails={false}
      isTaxInvoice={false}
    />
  );
}
