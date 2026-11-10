import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TaskForm } from '@/components/tasks/TaskForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getMeeting } from '@/server/services/meetingService';
import { listProjectOptions } from '@/server/services/projectService';
import { getTask, listAssignableEmployees } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'New task' };

type NewTaskPageProps = {
  searchParams: Promise<{ projectId?: string; clientId?: string; parentTaskId?: string; meetingId?: string }>;
};

export default async function NewTaskPage({ searchParams }: NewTaskPageProps) {
  const access = await requirePagePermission(permissionKeys.tasksCreate);
  const params = await searchParams;

  const projectId = parseId(params.projectId);
  const clientId = parseId(params.clientId);
  const parentTaskId = parseId(params.parentTaskId);

  const meetingId = parseId(params.meetingId);

  const [parent, meeting] = await Promise.all([
    parentTaskId ? getTask(parentTaskId) : null,
    meetingId ? getMeeting(meetingId) : null,
  ]);
  if (parentTaskId && !parent) notFound();
  if (meetingId && !meeting) notFound();

  const [assignees, reviewers, projects, clients] = await Promise.all([
    listAssignableEmployees(projectId ?? parent?.project_id),
    listEmployeeOptions(),
    listProjectOptions(),
    listClientOptions(access),
  ]);

  return (
    <>
      <PageHeader
        title={parent ? 'New subtask' : meeting ? 'New follow-up task' : 'New task'}
        description={parent ? `Part of ${parent.title}` : meeting ? `From the meeting ${meeting.title}` : undefined}
      />
      <Panel>
        <TaskForm
          parentTaskId={parentTaskId}
          meetingId={meeting?.id}
          defaults={{
            projectId: projectId ?? parent?.project_id ?? meeting?.project_id ?? undefined,
            clientId: clientId ?? parent?.client_id ?? meeting?.client_id ?? undefined,
          }}
          assignees={assignees.map((person) => ({ value: person.id, label: person.full_name }))}
          reviewers={reviewers.map((person) => ({ value: person.id, label: person.full_name }))}
          projects={projects.map((project) => ({ value: project.id, label: project.name }))}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          cancelHref={parent ? `/tasks/${parent.id}` : meeting ? `/meetings/${meeting.id}` : '/tasks'}
        />
      </Panel>
    </>
  );
}
