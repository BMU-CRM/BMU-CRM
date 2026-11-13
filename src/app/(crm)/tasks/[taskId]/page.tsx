import { Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { LinkedFilesPanel } from '@/components/files/LinkedFilesPanel';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { PriorityBadge, TaskStatusBadge } from '@/components/tasks/TaskBadges';
import { TaskLiveRefresh } from '@/components/tasks/TaskLiveRefresh';
import {
  TaskChecklistPanel,
  TaskCollaboratorsPanel,
  TaskCommentsPanel,
  TaskDependenciesPanel,
  TaskEscalatePanel,
  TaskHistoryPanel,
  TaskProgressForm,
  TaskReassignPanel,
  TaskSubtasksPanel,
} from '@/components/tasks/TaskPanels';
import { TaskSendFiles } from '@/components/tasks/TaskSendFiles';
import { TaskStatusActions } from '@/components/tasks/TaskStatusActions';
import { TaskWorkTimer } from '@/components/tasks/TaskWorkTimer';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateRange, formatDateTime, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { getTaskActions, isTaskOpen } from '@/lib/tasks/taskWorkflow';
import { deleteTaskAction } from '@/server/actions/taskActions';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listLinkedFiles } from '@/server/services/fileService';
import {
  countUnsentTaskFiles,
  getTask,
  getTaskActor,
  listAssignableEmployees,
  listDependencyOptions,
  loadTaskPanels,
} from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Task' };

type TaskPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function TaskPage({ params }: TaskPageProps) {
  const access = await requirePagePermission(permissionKeys.tasksView);
  const taskId = parseId((await params).taskId);
  if (!taskId) notFound();

  const task = await getTask(taskId);
  if (!task) notFound();

  const today = todayInIndia();
  const actor = await getTaskActor(access, task);

  const [panels, attachments, unsentFiles, assignable, dependencyOptions, employees] = await Promise.all([
    loadTaskPanels(task.id),
    listLinkedFiles({ taskId: task.id }),
    countUnsentTaskFiles(task.id),
    actor.canManage ? listAssignableEmployees(task.project_id) : Promise.resolve([]),
    actor.canManage ? listDependencyOptions(task) : Promise.resolve([]),
    actor.canManage ? listEmployeeOptions() : Promise.resolve([]),
  ]);

  const isOpen = isTaskOpen(task.status);
  const isCollaborator = panels.collaborators.some((person) => person.id === access.employee.id);
  const canWork = actor.canManage || actor.isAssignee || isCollaborator;
  const canUpdateProgress = (actor.isAssignee || actor.canManage) && isOpen;
  const canDelete = actor.canManage && (task.status === 'not_started' || task.status === 'assigned');

  // Up the reporting line, or back to whoever assigned it.
  const managerId = task.assignee?.reporting_manager_id;
  const escalateId = managerId ?? (task.created_by !== access.employee.id ? task.created_by : null);
  const canEscalate = isOpen && (actor.isAssignee || actor.canManage) && escalateId && task.escalated_to !== escalateId;
  const escalateName = canEscalate
    ? (await listEmployeeOptions()).find((person) => person.id === escalateId)?.full_name
    : undefined;

  // Files the person added go to whoever assigned the task, and its reviewer.
  const sendTo = [task.creator, task.reviewer]
    .filter((person): person is NonNullable<typeof person> => person !== null && person.id !== access.employee.id)
    .map((person) => person.full_name)
    .filter((name, index, names) => names.indexOf(name) === index);

  const links = task.reference_links.flatMap((link) => {
    const url = safeExternalUrl(link);
    return url ? [url] : [];
  });

  return (
    <>
      <TaskLiveRefresh taskId={task.id} />
      <PageHeader
        title={task.title}
        description={task.task_code}
        actions={
          <>
            <TaskStatusActions taskId={task.id} actions={getTaskActions(task.status, actor)} />
            {actor.canManage && (
              <ButtonLink href={`/tasks/${task.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
            )}
            {canDelete && (
              <ConfirmActionButton
                label="Delete"
                title="Delete this task?"
                description="This cannot be undone. Only tasks that have not started can be deleted."
                confirmLabel="Delete"
                action={deleteTaskAction.bind(null, task.id)}
              />
            )}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel>
            <div className={layout.badges}>
              <TaskStatusBadge status={task.status} dueDate={task.due_date} today={today} />
              <PriorityBadge priority={task.priority} />
              {task.recurrence !== 'none' && <StatusBadge>Repeats {task.recurrence}</StatusBadge>}
              {task.escalated_to && <StatusBadge tone="warning">Escalated to {task.escalatedTo?.full_name}</StatusBadge>}
            </div>
            <div className={layout.spaced}>
              <ProgressBar value={task.completion_percentage} label="Task progress" />
            </div>
            {task.description && <p className={`${layout.text} ${layout.spaced}`}>{task.description}</p>}
            {task.status === 'on_hold' && task.resume_requested_at && (
              <p className={`${layout.text} ${layout.spaced}`}>
                <strong>
                  {task.resumeRequestedBy?.full_name ?? 'A manager'} asked {actor.isAssignee ? 'you' : (task.assignee?.full_name ?? 'the assignee')} to resume this
                  work
                </strong>{' '}
                on {formatDateTime(task.resume_requested_at)}
                {task.resume_request_note ? `: “${task.resume_request_note}”.` : '.'}
                {actor.isAssignee ? ' Press Resume work to start; your hours count from then.' : ' Their hours count from when they resume.'}
              </p>
            )}
            {task.escalation_reason && (
              <p className={`${layout.muted} ${layout.spaced}`}>Escalation reason: {task.escalation_reason}</p>
            )}
            {canUpdateProgress && (
              <div className={layout.spaced}>
                <TaskProgressForm taskId={task.id} percentage={task.completion_percentage} />
              </div>
            )}
          </Panel>
          <LinkedFilesPanel
            title="Attachments and deliverables"
            files={attachments}
            links={{ taskId: task.id }}
            canUpload={canWork && access.permissions[permissionKeys.filesUpload] !== undefined}
            referenceLinks={links}
            footer={
              unsentFiles > 0 && sendTo.length > 0 ? (
                <TaskSendFiles taskId={task.id} unsentCount={unsentFiles} recipientNames={sendTo.join(' and ')} />
              ) : undefined
            }
          />
          <TaskChecklistPanel taskId={task.id} items={panels.checklist} canWork={canWork} />
          {!task.parent_task_id && (
            <TaskSubtasksPanel taskId={task.id} subtasks={panels.subtasks} canAdd={canWork && isOpen} today={today} />
          )}
          <TaskDependenciesPanel
            taskId={task.id}
            dependencies={panels.dependencies}
            options={dependencyOptions.map((option) => ({ value: option.id, label: `${option.task_code} · ${option.title}` }))}
            canManage={actor.canManage}
            today={today}
          />
          <TaskCommentsPanel taskId={task.id} comments={panels.comments} />
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Assigned to</dt>
                <dd>
                  {task.assignee?.full_name ?? 'Unassigned'}{' '}
                  {task.assignee && <PresenceDot employeeId={task.assignee.id} withLabel />}
                </dd>
              </div>
              <div>
                <dt>Assigned by</dt>
                <dd>{task.creator?.full_name ?? 'System'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(task.created_at)}</dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>{task.reviewer?.full_name ?? task.creator?.full_name ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{task.department?.name ?? 'None'}</dd>
              </div>
              {task.parent && (
                <div>
                  <dt>Part of</dt>
                  <dd>
                    <Link href={`/tasks/${task.parent.id}`} className={layout.link}>
                      {task.parent.title}
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt>Project</dt>
                <dd>
                  {task.project ? (
                    <Link href={`/projects/${task.project.id}`} className={layout.link}>
                      {task.project.name}
                    </Link>
                  ) : (
                    'None'
                  )}
                </dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>{task.clientName ?? 'None'}</dd>
              </div>
              <div>
                <dt>Dates</dt>
                <dd>{formatDateRange(task.start_date, task.due_date)}</dd>
              </div>
              <div>
                <dt>Hours worked</dt>
                <dd>
                  <TaskWorkTimer
                    countedSeconds={task.countedSeconds}
                    startedAt={task.status === 'in_progress' ? task.work_started_at : null}
                  />
                  {task.estimated_hours !== null ? ` of ${task.estimated_hours} h estimated` : ''}
                  <p className={layout.muted}>
                    Counts only while the task is in progress. It pauses when the task is put on hold or handed in, and carries on
                    from the same figure on Resume work.
                  </p>
                </dd>
              </div>
              <div>
                <dt>Complexity</dt>
                <dd>{task.complexity} of 5</dd>
              </div>
              {task.completed_at && (
                <div>
                  <dt>Completed</dt>
                  <dd>
                    {formatDateTime(task.completed_at)}
                    {task.verifier ? `, signed off by ${task.verifier.full_name}` : ''}
                    {task.quality_rating ? `, rated ${task.quality_rating} of 5` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
          {actor.canManage && isOpen && (
            <TaskReassignPanel
              taskId={task.id}
              assigneeId={task.assignee_id}
              options={assignable.map((person) => ({ value: person.id, label: person.full_name }))}
            />
          )}
          {canEscalate && escalateName && (
            <TaskEscalatePanel taskId={task.id} escalateTo={{ id: escalateId, name: escalateName }} />
          )}
          <TaskCollaboratorsPanel
            taskId={task.id}
            collaborators={panels.collaborators}
            options={employees.map((person) => ({ value: person.id, label: person.full_name }))}
            canManage={actor.canManage}
          />
          <TaskHistoryPanel history={panels.history} />
        </div>
      </div>
    </>
  );
}
