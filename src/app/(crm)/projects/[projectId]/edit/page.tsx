import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartments } from '@/server/services/organisationService';
import { canManageProject, getProject } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'Edit project' };

type EditProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const access = await requirePagePermission(permissionKeys.projectsUpdate);
  const projectId = parseId((await params).projectId);
  if (!projectId) notFound();

  const [project, canManage, departments, managers] = await Promise.all([
    getProject(projectId),
    canManageProject(projectId),
    listDepartments(),
    listEmployeeOptions(),
  ]);
  if (!project || !canManage) notFound();
  const clients = await listClientOptions(access, project.client_id);

  return (
    <>
      <PageHeader title={`Edit ${project.name}`} />
      <Panel>
        <ProjectForm
          project={project}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
        />
      </Panel>
    </>
  );
}
