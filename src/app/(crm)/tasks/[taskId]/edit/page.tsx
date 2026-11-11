import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TaskForm } from '@/components/tasks/TaskForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listProjectOptions } from '@/server/services/projectService';
import { getTask, getTaskActor, listAssignableEmployees, listReviewerOptions } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Edit task' };

type EditTaskPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const access = await requirePagePermission(permissionKeys.tasksView);
  const taskId = parseId((await params).taskId);
  if (!taskId) notFound();

  const task = await getTask(taskId);
  if (!task) notFound();

  const actor = await getTaskActor(access, task);
  if (!actor.canManage) notFound();

  const [assignees, reviewers, projects, clients] = await Promise.all([
    listAssignableEmployees(task.project_id),
    listReviewerOptions([task.created_by, task.reviewer_id]),
    listProjectOptions(),
    listClientOptions(access, task.client_id),
  ]);

  // The current assignee stays selectable even if they are outside this user's reach.
  const assigneeOptions = assignees.map((person) => ({ value: person.id, label: person.full_name }));
  if (task.assignee && !assignees.some((person) => person.id === task.assignee?.id)) {
    assigneeOptions.push({ value: task.assignee.id, label: task.assignee.full_name });
  }

  return (
    <>
      <PageHeader title={`Edit ${task.title}`} />
      <Panel>
        <TaskForm
          task={task}
          parentTaskId={task.parent_task_id ?? undefined}
          assignees={assigneeOptions}
          reviewers={reviewers}
          projects={projects.map((project) => ({ value: project.id, label: project.name }))}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          cancelHref={`/tasks/${task.id}`}
        />
      </Panel>
    </>
  );
}
