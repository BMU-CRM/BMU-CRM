import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FinanceDocumentForm } from '@/components/finance/FinanceDocumentForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listPricedServices } from '@/server/services/catalogService';
import { getSigningChoice } from '@/server/services/signatureService';
import {
  getFinanceSettings,
  hasFinanceReach,
  listBillingClients,
  toClientChoices,
} from '@/server/services/financeService';
import { getInvoice, listInvoiceItems } from '@/server/services/invoiceService';
import { listProjectOptions } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'Edit invoice' };

type EditInvoicePageProps = {
  params: Promise<{ invoiceId: string }>;
};

// Only drafts can be edited. An issued invoice is locked, as GST requires.
export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const access = await requirePagePermission(permissionKeys.invoicesManage);
  const invoiceId = parseId((await params).invoiceId);
  if (!invoiceId) notFound();

  const [invoice, items, settings, clients, projects, services] = await Promise.all([
    getInvoice(invoiceId),
    listInvoiceItems(invoiceId),
    getFinanceSettings(),
    listBillingClients(access, permissionKeys.invoicesManage),
    listProjectOptions(),
    listPricedServices(),
  ]);
  const signing = await getSigningChoice(access.employee.id, invoice);
  if (!invoice || invoice.status !== 'draft' || !hasFinanceReach(access, permissionKeys.invoicesManage, invoice)) notFound();

  const choices = toClientChoices(clients);
  if (invoice.client && !choices.some((choice) => choice.value === invoice.client_id)) {
    choices.unshift({ value: invoice.client_id, label: invoice.client.company_name, billingState: null, address: null, gstin: null });
  }

  return (
    <>
      <PageHeader title="Edit draft invoice" description={invoice.title} />
      <FinanceDocumentForm
        kind="invoice"
        document={{ ...invoice, end_date: invoice.due_date }}
        items={items.map((item) => ({
          description: item.description,
          hsnSac: item.hsn_sac ?? '',
          quantity: String(item.quantity),
          unitPrice: String(item.unit_price),
          taxRate: String(item.tax_rate),
          serviceGroup: item.service_group ?? '',
          serviceName: item.service_name ?? '',
          billing: item.billing ?? '',
        }))}
        clients={choices}
        projects={projects.map((project) => ({ value: project.id, label: project.name, clientId: project.client_id }))}
        companyState={settings?.state ?? null}
        defaultTaxRate={settings?.default_tax_rate ?? 18}
        endDays={settings?.payment_terms_days ?? 15}
        defaultTerms={settings?.invoice_terms ?? null}
        today={todayInIndia()}
        services={services}
        signing={signing}
      />
    </>
  );
}
