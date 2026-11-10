import type { Metadata } from 'next';
import { FinanceDocumentForm } from '@/components/finance/FinanceDocumentForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getFinanceSettings, listBillingClients, toClientChoices } from '@/server/services/financeService';
import { listProjectOptions } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'New quotation' };

type NewQuotationPageProps = {
  searchParams: Promise<{ clientId?: string }>;
};

export default async function NewQuotationPage({ searchParams }: NewQuotationPageProps) {
  const access = await requirePagePermission(permissionKeys.quotationsManage);
  const clientId = parseId((await searchParams).clientId);

  const [settings, clients, projects] = await Promise.all([
    getFinanceSettings(),
    listBillingClients(access, permissionKeys.quotationsManage),
    listProjectOptions(),
  ]);

  return (
    <>
      <PageHeader title="New quotation" description="It is saved as a draft. Nothing is sent until you mark it as sent." />
      <FinanceDocumentForm
        kind="quotation"
        defaultClientId={clients.some((client) => client.id === clientId) ? clientId : undefined}
        clients={toClientChoices(clients)}
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
