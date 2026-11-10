import type { Metadata } from 'next';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'New project' };

type NewProjectPageProps = {
  searchParams: Promise<{ clientId?: string }>;
};

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  const access = await requirePagePermission(permissionKeys.projectsCreate);
  const clientId = parseId((await searchParams).clientId);

  const [clients, departments, managers] = await Promise.all([
    listClientOptions(access),
    listDepartments(),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <PageHeader title="New project" />
      <Panel>
        <ProjectForm
          defaultClientId={clientId}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
        />
      </Panel>
    </>
  );
}
