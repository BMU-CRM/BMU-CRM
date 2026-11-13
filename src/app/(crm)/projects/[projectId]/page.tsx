import { MessagesSquare, Pencil, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { LinkedFilesPanel } from '@/components/files/LinkedFilesPanel';
import { ProjectHealthBadge, ProjectStatusBadge } from '@/components/projects/ProjectBadges';
import { ProjectMembersPanel, ProjectMilestonesPanel } from '@/components/projects/ProjectPanels';
import { PriorityBadge } from '@/components/tasks/TaskBadges';
import { TaskLiveRefresh } from '@/components/tasks/TaskLiveRefresh';
import { TaskTable } from '@/components/tasks/TaskTable';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateRange } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listLinkedFiles } from '@/server/services/fileService';
import { findLinkedConversationId } from '@/server/services/messageService';
import {
  canManageProject,
  getProject,
  listProjectMembers,
  listProjectMilestones,
} from '@/server/services/projectService';
import { listTasksForProject } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Project' };

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const access = await requirePagePermission(permissionKeys.projectsView);
  const projectId = parseId((await params).projectId);
  if (!projectId) notFound();

  const project = await getProject(projectId);
  if (!project) notFound();

  const [canManage, members, milestones, tasks, employees, files, chatId] = await Promise.all([
    canManageProject(projectId),
    listProjectMembers(projectId),
    listProjectMilestones(projectId),
    listTasksForProject(projectId),
    listEmployeeOptions(),
    listLinkedFiles({ projectId }),
    access.permissions[permissionKeys.messagesUse] !== undefined
      ? findLinkedConversationId({ projectId })
      : Promise.resolve(null),
  ]);

  const canCreateTask = access.permissions[permissionKeys.tasksCreate] !== undefined;
  const isMember = members.some((member) => member.id === access.employee.id);
  const canUpload = (canManage || isMember) && access.permissions[permissionKeys.filesUpload] !== undefined;

  return (
    <>
      <TaskLiveRefresh />
      <PageHeader
        title={project.name}
        description={project.project_code}
        actions={
          <>
            {chatId && (
              <ButtonLink href={`/messages/${chatId}`}>
                <MessagesSquare size={16} aria-hidden="true" />
                Team chat
              </ButtonLink>
            )}
            {canManage && (
              <ButtonLink href={`/projects/${project.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel>
            <div className={layout.badges}>
              <ProjectStatusBadge status={project.status} />
              <ProjectHealthBadge health={project.health} />
              <PriorityBadge priority={project.priority} />
            </div>
            <div className={layout.spaced}>
              <ProgressBar value={project.progress} label="Project progress" />
              <p className={layout.muted}>
                {project.completedTasks} of {project.totalTasks} tasks complete · {project.overdueTasks} overdue
              </p>
            </div>
            {project.description && <p className={`${layout.text} ${layout.spaced}`}>{project.description}</p>}
          </Panel>
          <Panel
            title="Tasks"
            action={
              canCreateTask && (
                <ButtonLink href={`/tasks/new?projectId=${project.id}`} variant="ghost">
                  <Plus size={16} aria-hidden="true" />
                  New task
                </ButtonLink>
              )
            }
            flush
          >
            {tasks.length === 0 ? <p className={layout.emptyText}>No tasks you can see yet.</p> : <TaskTable tasks={tasks} />}
          </Panel>
          <ProjectMilestonesPanel projectId={project.id} milestones={milestones} canManage={canManage} />
          <LinkedFilesPanel title="Project files" files={files} links={{ projectId: project.id }} canUpload={canUpload} />
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Client</dt>
                <dd>
                  {project.client_id && access.permissions[permissionKeys.clientsView] !== undefined ? (
                    <Link href={`/clients/${project.client_id}`} className={layout.link}>
                      {project.clientName}
                    </Link>
                  ) : (
                    (project.clientName ?? 'Internal project')
                  )}
                </dd>
              </div>
              <div>
                <dt>Project manager</dt>
                <dd>{project.manager?.full_name ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Lead department</dt>
                <dd>{project.department?.name ?? 'None'}</dd>
              </div>
              <div>
                <dt>Dates</dt>
                <dd>{formatDateRange(project.start_date, project.due_date)}</dd>
              </div>
            </dl>
          </Panel>
          <ProjectMembersPanel
            projectId={project.id}
            members={members}
            options={employees.map((person) => ({ value: person.id, label: person.full_name }))}
            canManage={canManage}
          />
        </div>
      </div>
    </>
  );
}
