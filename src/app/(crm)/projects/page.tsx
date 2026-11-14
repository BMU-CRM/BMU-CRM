import { Plus, SquareKanban } from 'lucide-react';
import type { Metadata } from 'next';
import { ProjectTable } from '@/components/projects/ProjectTable';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parsePage } from '@/lib/parseListParams';
import { projectStatusLabels, type ProjectStatus } from '@/lib/projects/projectHealth';
import { requirePagePermission } from '@/server/services/accessService';
import { listProjects, projectsPerPage } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'Projects' };

const statusOptions = Object.entries(projectStatusLabels).map(([value, label]) => ({ value, label }));

type ProjectsPageProps = {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const access = await requirePagePermission(permissionKeys.projectsView);
  const params = await searchParams;

  const status = params.status && params.status in projectStatusLabels ? (params.status as ProjectStatus) : undefined;
  const page = parsePage(params.page);
  const { projects, total } = await listProjects({ search: params.search, status, page });

  const canCreate = access.permissions[permissionKeys.projectsCreate] !== undefined;
  const isFiltered = Boolean(params.search || status);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    return `/projects?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description={`${total} ${total === 1 ? 'project' : 'projects'}`}
        actions={
          canCreate && (
            <ButtonLink href="/projects/new" variant="primary">
              <Plus size={16} aria-hidden="true" />
              New project
            </ButtonLink>
          )
        }
      />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Name or ID" defaultValue={params.search} />
        <SelectField label="Status" name="status" options={statusOptions} placeholder="All statuses" defaultValue={status} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/projects" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {projects.length === 0 ? (
          <EmptyState
            icon={SquareKanban}
            title={isFiltered ? 'No matching projects' : 'No projects yet'}
            description={isFiltered ? 'Try different filters.' : 'Projects you are part of appear here.'}
          />
        ) : (
          <>
            <ProjectTable projects={projects} />
            <PaginationBar page={page} perPage={projectsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
