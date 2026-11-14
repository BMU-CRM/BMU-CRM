import type { Metadata } from 'next';
import { FinanceDocumentForm } from '@/components/finance/FinanceDocumentForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientServiceItems, listPricedServices } from '@/server/services/catalogService';
import { getSigningChoice } from '@/server/services/signatureService';
import { getFinanceSettings, listBillingClients, toClientChoices } from '@/server/services/financeService';
import { listProjectOptions } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'New invoice' };

type NewInvoicePageProps = {
  searchParams: Promise<{ clientId?: string }>;
};

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const access = await requirePagePermission(permissionKeys.invoicesManage);
  const clientId = parseId((await searchParams).clientId);

  const [settings, clients, projects, services, signing] = await Promise.all([
    getFinanceSettings(),
    listBillingClients(access, permissionKeys.invoicesManage),
    listProjectOptions(),
    listPricedServices(),
    getSigningChoice(access.employee.id),
  ]);
  const clientServiceItems = await listClientServiceItems(clients.map((client) => client.id));

  return (
    <>
      <PageHeader
        title="New invoice"
        description="It is saved as a draft. It gets its invoice number when you issue it, and can no longer be changed after that."
      />
      <FinanceDocumentForm
        kind="invoice"
        defaultClientId={clients.some((client) => client.id === clientId) ? clientId : undefined}
        clients={toClientChoices(clients)}
        projects={projects.map((project) => ({ value: project.id, label: project.name, clientId: project.client_id }))}
        companyState={settings?.state ?? null}
        defaultTaxRate={settings?.default_tax_rate ?? 18}
        endDays={settings?.payment_terms_days ?? 15}
        defaultTerms={settings?.invoice_terms ?? null}
        today={todayInIndia()}
        services={services}
        signing={signing}
        clientServiceItems={clientServiceItems}
      />
    </>
  );
}
