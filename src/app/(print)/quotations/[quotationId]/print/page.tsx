import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintableDocument } from '@/components/finance/PrintableDocument';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getQuotation, listQuotationItems } from '@/server/services/quotationService';
import { getSignatory } from '@/server/services/signatureService';

type PrintQuotationPageProps = {
  params: Promise<{ quotationId: string }>;
};

// Named after the document, such as "QUO-0067 - Acme Interiors", so a saved PDF gets
// that file name.
export async function generateMetadata({ params }: PrintQuotationPageProps): Promise<Metadata> {
  const quotationId = parseId((await params).quotationId);
  const quotation = quotationId ? await getQuotation(quotationId) : null;
  if (!quotation) return { title: 'Quotation' };
  return { title: { absolute: [quotation.quotation_number, quotation.client?.company_name].filter(Boolean).join(' - ') } };
}

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
  const signatory = await getSignatory(quotation.signed_by);

  return (
    <PrintableDocument
      heading="Quotation"
      fromLabel="Quotation from"
      partyLabel="Quotation to"
      overview={quotation.overview}
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
      showBankDetails
      isTaxInvoice={false}
      signatory={signatory}
      showSeal={quotation.show_seal}
      closingLine="We look forward to working with you"
      clientAcceptance
    />
  );
}
