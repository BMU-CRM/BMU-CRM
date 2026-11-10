import type { Metadata } from 'next';
import { ClientForm } from '@/components/clients/ClientForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listIndustryOptions, listServiceGroupOptions, listServiceOptions } from '@/server/services/catalogService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Add client' };

export default async function NewClientPage() {
  await requirePagePermission(permissionKeys.clientsCreate);

  const [managers, departments, industries, serviceGroups, services] = await Promise.all([
    listEmployeeOptions(),
    listDepartments(),
    listIndustryOptions(),
    listServiceGroupOptions(),
    listServiceOptions(),
  ]);

  return (
    <>
      <PageHeader title="Add client" description="Add a new lead or client, with the services they want." />
      <Panel>
        <ClientForm
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
          industries={industries}
          serviceGroups={serviceGroups}
          services={services}
        />
      </Panel>
    </>
  );
}
