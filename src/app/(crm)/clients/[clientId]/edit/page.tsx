import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClientForm } from '@/components/clients/ClientForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listIndustryOptions, listServiceGroupOptions, listServiceOptions } from '@/server/services/catalogService';
import { canUpdateClient, getClient, listClientServices } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit client' };

type EditClientPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function EditClientPage({ params }: EditClientPageProps) {
  await requirePagePermission(permissionKeys.clientsUpdate);
  const clientId = parseId((await params).clientId);
  if (!clientId) notFound();

  const [client, canUpdate, managers, departments, clientServices] = await Promise.all([
    getClient(clientId),
    canUpdateClient(clientId),
    listEmployeeOptions(),
    listDepartments(),
    listClientServices(clientId),
  ]);
  if (!client || !canUpdate) notFound();

  // The form holds the client's current services. Ended ones stay as history.
  const serviceIds = clientServices.flatMap((service) => (service.status !== 'ended' && service.service_id ? [service.service_id] : []));
  const [industries, services] = await Promise.all([listIndustryOptions(client.industry_id), listServiceOptions(serviceIds)]);
  const serviceGroups = await listServiceGroupOptions(
    services.filter((service) => serviceIds.includes(service.value)).map((service) => service.groupId),
  );

  return (
    <>
      <PageHeader title={`Edit ${client.company_name}`} />
      <Panel>
        <ClientForm
          client={client}
          serviceIds={serviceIds}
          industries={industries}
          serviceGroups={serviceGroups}
          services={services}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
        />
      </Panel>
    </>
  );
}
