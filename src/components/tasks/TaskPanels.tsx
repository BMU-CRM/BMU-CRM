import Link from 'next/link';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { describeTaskChanges } from '@/lib/audit/describeAuditEntry';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import {
  addChecklistItemAction,
  addTaskCollaboratorAction,
  addTaskCommentAction,
  addTaskDependencyAction,
  deleteChecklistItemAction,
  escalateTaskAction,
  reassignTaskAction,
  removeTaskCollaboratorAction,
  removeTaskDependencyAction,
  setChecklistItemDoneAction,
  updateTaskProgressAction,
} from '@/server/actions/taskActions';
import type { loadTaskPanels } from '@/server/services/taskService';
import { TaskStatusBadge } from './TaskBadges';
import styles from './TaskPanels.module.css';

type Panels = Awaited<ReturnType<typeof loadTaskPanels>>;

type ChecklistProps = { taskId: string; items: Panels['checklist']; canWork: boolean };

export function TaskChecklistPanel({ taskId, items, canWork }: ChecklistProps) {
  const done = items.filter((item) => item.is_done).length;

  return (
    <Panel title="Checklist" description={`${done} of ${items.length} done`} flush>
      {items.length > 0 && (
        <ul className={layout.list}>
          {items.map((item) => (
            <li key={item.id} className={layout.row}>
              <span className={item.is_done ? styles.done : undefined}>{item.label}</span>
              {canWork && (
                <span className={layout.rowActions}>
                  <ActionButton
                    label={item.is_done ? 'Undo' : 'Done'}
                    action={setChecklistItemDoneAction.bind(null, taskId, item.id, !item.is_done)}
                  />
                  <ActionButton label="Remove" action={deleteChecklistItemAction.bind(null, taskId, item.id)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWork && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addChecklistItemAction.bind(null, taskId)} submitLabel="Add item">
            <TextField label="New item" name="label" required />
          </InlineActionForm>
        </div>
      )}
      {!canWork && items.length === 0 && <p className={layout.emptyText}>No checklist items.</p>}
    </Panel>
  );
}

type SubtasksProps = { taskId: string; subtasks: Panels['subtasks']; canAdd: boolean; today: string };

export function TaskSubtasksPanel({ taskId, subtasks, canAdd, today }: SubtasksProps) {
  return (
    <Panel
      title="Subtasks"
      description={`${subtasks.length} ${subtasks.length === 1 ? 'subtask' : 'subtasks'}`}
      action={canAdd && <ButtonLink href={`/tasks/new?parentTaskId=${taskId}`} variant="ghost">Add subtask</ButtonLink>}
      flush
    >
      {subtasks.length === 0 ? (
        <p className={layout.emptyText}>No subtasks yet.</p>
      ) : (
        <ul className={layout.list}>
          {subtasks.map((subtask) => (
            <li key={subtask.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/tasks/${subtask.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {subtask.title}
                </Link>
                <p className={layout.muted}>
                  {subtask.assignee?.full_name ?? 'Unassigned'}
                  {subtask.due_date ? ` · Due ${formatDate(subtask.due_date)}` : ''}
                </p>
              </div>
              <span className={layout.badges}>
                <TaskStatusBadge status={subtask.status} dueDate={subtask.due_date} today={today} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type DependenciesProps = {
  taskId: string;
  dependencies: Panels['dependencies'];
  options: SelectOption[];
  canManage: boolean;
  today: string;
};

export function TaskDependenciesPanel({ taskId, dependencies, options, canManage, today }: DependenciesProps) {
  return (
    <Panel title="Waiting for" description="This task cannot start until these are complete." flush>
      {dependencies.length === 0 ? (
        <p className={layout.emptyText}>Not waiting for anything.</p>
      ) : (
        <ul className={layout.list}>
          {dependencies.map((blocker) => (
            <li key={blocker.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/tasks/${blocker.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {blocker.title}
                </Link>
                <p className={layout.muted}>{blocker.task_code}</p>
              </div>
              <span className={layout.rowActions}>
                <TaskStatusBadge status={blocker.status} dueDate={null} today={today} />
                {canManage && <ActionButton label="Remove" action={removeTaskDependencyAction.bind(null, taskId, blocker.id)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canManage && options.length > 0 && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addTaskDependencyAction.bind(null, taskId)} submitLabel="Add">
            <SelectField label="Task" name="dependsOnTaskId" options={options} placeholder="Choose a task" required />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}

type CommentsProps = { taskId: string; comments: Panels['comments'] };

export function TaskCommentsPanel({ taskId, comments }: CommentsProps) {
  return (
    <Panel title="Comments" description={`${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`} flush>
      {comments.length > 0 && (
        <ul className={layout.list}>
          {comments.map((comment) => (
            <li key={comment.id} className={styles.comment}>
              <PersonAvatar name={comment.author?.full_name ?? '?'} size="small" />
              <div className={layout.rowMain}>
                <p>
                  <span className={layout.rowTitle}>{comment.author?.full_name ?? 'Former employee'}</span>{' '}
                  <span className={layout.muted}>{formatDateTime(comment.created_at)}</span>
                </p>
                <p className={layout.text}>{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className={layout.sectionForm}>
        <InlineActionForm action={addTaskCommentAction.bind(null, taskId)} submitLabel="Post comment">
          <TextAreaField label="Add a comment" name="body" rows={2} required />
        </InlineActionForm>
      </div>
    </Panel>
  );
}

type HistoryProps = { history: Panels['history'] };

export function TaskHistoryPanel({ history }: HistoryProps) {
  // Entries that only touched bookkeeping, such as the work clock, have nothing to show.
  const entries = history.map((entry) => ({ entry, lines: describeTaskChanges(entry.details) })).filter(({ lines }) => lines.length > 0);
  return (
    <Panel title="History" flush>
      <ul className={layout.list}>
        {entries.map(({ entry, lines }) => (
          <li key={entry.id} className={layout.row}>
            <div className={layout.rowMain}>
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className={layout.muted}>
                {entry.actor_name} · {formatDateTime(entry.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type ProgressProps = { taskId: string; percentage: number };

// Only progress is entered here. Hours worked are counted from Start work.
export function TaskProgressForm({ taskId, percentage }: ProgressProps) {
  return (
    <InlineActionForm action={updateTaskProgressAction.bind(null, taskId)} submitLabel="Save progress">
      <TextField label="Progress %" name="completionPercentage" type="number" min={0} max={100} defaultValue={percentage} required />
    </InlineActionForm>
  );
}

type CollaboratorsProps = {
  taskId: string;
  collaborators: Panels['collaborators'];
  options: SelectOption[];
  canManage: boolean;
};

export function TaskCollaboratorsPanel({ taskId, collaborators, options, canManage }: CollaboratorsProps) {
  const available = options.filter((option) => !collaborators.some((person) => person.id === option.value));

  return (
    <Panel title="Collaborators" flush>
      {collaborators.length === 0 ? (
        <p className={layout.emptyText}>No collaborators.</p>
      ) : (
        <ul className={layout.list}>
          {collaborators.map((person) => (
            <li key={person.id} className={layout.row}>
              <span className={layout.rowMain}>{person.full_name}</span>
              {canManage && <ActionButton label="Remove" action={removeTaskCollaboratorAction.bind(null, taskId, person.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addTaskCollaboratorAction.bind(null, taskId)} submitLabel="Add">
            <SelectField label="Person" name="employeeId" options={available} placeholder="Choose someone" required />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}

type ReassignProps = { taskId: string; assigneeId: string | null; options: SelectOption[] };

export function TaskReassignPanel({ taskId, assigneeId, options }: ReassignProps) {
  return (
    <Panel title="Reassign">
      <InlineActionForm action={reassignTaskAction.bind(null, taskId)} submitLabel="Reassign">
        <SelectField
          label="Assign to"
          name="assigneeId"
          options={options.filter((option) => option.value !== assigneeId)}
          placeholder="Choose someone"
          required
        />
      </InlineActionForm>
    </Panel>
  );
}

type EscalateProps = { taskId: string; escalateTo: { id: string; name: string } };

export function TaskEscalatePanel({ taskId, escalateTo }: EscalateProps) {
  return (
    <Panel title="Escalate" description={`Raise this with ${escalateTo.name}.`}>
      <InlineActionForm action={escalateTaskAction.bind(null, taskId, escalateTo.id)} submitLabel="Escalate">
        <TextField label="Reason" name="reason" required />
      </InlineActionForm>
    </Panel>
  );
}
