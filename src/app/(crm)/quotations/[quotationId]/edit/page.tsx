import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FinanceDocumentForm } from '@/components/finance/FinanceDocumentForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getFinanceSettings,
  hasFinanceReach,
  listBillingClients,
  toClientChoices,
} from '@/server/services/financeService';
import { listProjectOptions } from '@/server/services/projectService';
import { getQuotation, listQuotationItems } from '@/server/services/quotationService';

export const metadata: Metadata = { title: 'Edit quotation' };

type EditQuotationPageProps = {
  params: Promise<{ quotationId: string }>;
};

export default async function EditQuotationPage({ params }: EditQuotationPageProps) {
  const access = await requirePagePermission(permissionKeys.quotationsManage);
  const quotationId = parseId((await params).quotationId);
  if (!quotationId) notFound();

  const [quotation, items, settings, clients, projects] = await Promise.all([
    getQuotation(quotationId),
    listQuotationItems(quotationId),
    getFinanceSettings(),
    listBillingClients(access, permissionKeys.quotationsManage),
    listProjectOptions(),
  ]);
  if (!quotation || !hasFinanceReach(access, permissionKeys.quotationsManage, quotation)) notFound();
  if (quotation.status !== 'draft' && quotation.status !== 'sent') notFound();

  const choices = toClientChoices(clients);
  if (quotation.client && !choices.some((choice) => choice.value === quotation.client_id)) {
    choices.unshift({ value: quotation.client_id, label: quotation.client.company_name, billingState: null, address: null, gstin: null });
  }

  return (
    <>
      <PageHeader title={`Edit ${quotation.quotation_number}`} description={quotation.title} />
      <FinanceDocumentForm
        kind="quotation"
        document={{ ...quotation, end_date: quotation.valid_until }}
        items={items.map((item) => ({
          description: item.description,
          hsnSac: item.hsn_sac ?? '',
          quantity: String(item.quantity),
          unitPrice: String(item.unit_price),
          taxRate: String(item.tax_rate),
        }))}
        clients={choices}
        projects={projects.map((project) => ({ value: project.id, label: project.name, clientId: project.client_id }))}
        companyState={settings?.state ?? null}
        defaultTaxRate={settings?.default_tax_rate ?? 18}
        endDays={settings?.quotation_validity_days ?? 30}
        defaultTerms={settings?.quotation_terms ?? null}
        today={todayInIndia()}
      />
    </>
  );
}
