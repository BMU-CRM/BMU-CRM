'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  databaseFailure,
  failure,
  isStillInUse,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { TaskStatus } from '@/lib/tasks/taskWorkflow';
import {
  myTaskSchema,
  checklistItemSchema,
  taskCommentSchema,
  taskEscalationSchema,
  taskProgressSchema,
  taskSchema,
} from '@/lib/validation/workSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshTask(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/tasks');
}

function taskValues(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    assigneeId: formData.get('assigneeId') ?? '',
    reviewerId: formData.get('reviewerId') ?? '',
    projectId: formData.get('projectId') ?? '',
    clientId: formData.get('clientId') ?? '',
    priority: formData.get('priority'),
    complexity: formData.get('complexity'),
    startDate: formData.get('startDate') ?? '',
    dueDate: formData.get('dueDate') ?? '',
    dueTime: formData.get('dueTime') ?? '',
    estimatedHours: formData.get('estimatedHours') ?? '',
    recurrence: formData.get('recurrence'),
    referenceLinks: formData.get('referenceLinks') ?? '',
  });
}

// meetingId is set only for a new follow-up task; the database checks the person can see that meeting.
export async function saveTaskAction(
  taskId: string | null,
  parentTaskId: string | null,
  meetingId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.tasksCreate))) return failure(noPermission);

  const parsed = taskValues(formData);
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    title: values.title,
    description: values.description,
    assignee_id: values.assigneeId,
    reviewer_id: values.reviewerId,
    project_id: values.projectId,
    client_id: values.clientId,
    priority: values.priority,
    complexity: values.complexity,
    start_date: values.startDate,
    due_date: values.dueDate,
    due_time: values.dueTime,
    estimated_hours: values.estimatedHours,
    recurrence: parentTaskId ? ('none' as const) : values.recurrence,
    reference_links: values.referenceLinks,
  };

  const database = await createDatabaseClient();
  let savedId = taskId;

  if (taskId) {
    const { data, error } = await database.from('tasks').update(row).eq('id', taskId).select('id');
    if (error) return databaseFailure(error);
    if (data.length === 0) return failure(noPermission);
  } else {
    const { data, error } = await database
      .from('tasks')
      .insert({ ...row, parent_task_id: parentTaskId, meeting_id: meetingId })
      .select('id')
      .single();
    if (error) return databaseFailure(error);
    savedId = data.id;
  }

  revalidatePath('/tasks', 'layout');
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
  redirect(`/tasks/${parentTaskId ?? savedId}`);
}

const workLinkSchema = z.url({ protocol: /^https$/, error: 'Enter a full https:// address for the link.' }).max(2000);

// workLink is an optional link to the finished work, such as a Google Drive folder. It
// is attached to the task like an uploaded file, so it shows with the deliverables.
export async function changeTaskStatusAction(
  taskId: string,
  status: TaskStatus,
  note: string | null,
  rating: number | null,
  workLink: string | null = null,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const link = workLink?.trim() ? workLinkSchema.safeParse(workLink.trim()) : null;
  if (link && !link.success) return failure(link.error.issues[0]?.message ?? 'Enter a valid link.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .update({ status, ...(rating ? { quality_rating: rating } : {}) })
    .eq('id', taskId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  if (note?.trim()) {
    await database.from('task_comments').insert({ task_id: taskId, body: note.trim() });
  }

  if (link?.success) {
    const host = new URL(link.data).hostname.replace(/^www\./, '');
    const { error: linkError } = await database
      .from('files')
      .insert({ kind: 'link', name: `Submitted work (${host})`, external_url: link.data, task_id: taskId })
      .select('id');
    refreshTask(taskId);
    if (linkError) {
      console.error('Could not attach the work link', linkError);
      return failure('The task was updated, but the link could not be attached. Please add it under Attachments.');
    }
    return success('Task updated.');
  }

  refreshTask(taskId);
  return success('Task updated.');
}

// A task for yourself, planned on the calendar. Nobody else is involved, so it starts
// as accepted and you mark it complete yourself.
export async function createMyTaskAction(values: {
  title: string;
  dueDate: string;
  dueTime: string;
  priority: string;
}): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.tasksCreate);
  if (!access) return failure(noPermission);

  const parsed = myTaskSchema.safeParse(values);
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database
    .from('tasks')
    .insert({
      title: parsed.data.title,
      assignee_id: access.employee.id,
      due_date: parsed.data.dueDate,
      due_time: parsed.data.dueTime,
      priority: parsed.data.priority,
    })
    .select('id')
    .single();
  if (error) return databaseFailure(error);

  revalidatePath('/calendar');
  revalidatePath('/tasks');
  return success('Task added.');
}

const rescheduleSchema = z.iso.date();

// Postpones or brings forward a task's deadline, from the calendar. The database lets
// the assignee move their own open work, and anyone who manages the task.
export async function rescheduleTaskAction(taskId: string, dueDate: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const parsed = rescheduleSchema.safeParse(dueDate);
  if (!parsed.success) return failure('Choose a valid date.');

  const database = await createDatabaseClient();
  const { data, error } = await database.from('tasks').update({ due_date: parsed.data }).eq('id', taskId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshTask(taskId);
  revalidatePath('/calendar');
  return success('Task moved.');
}

export async function updateTaskProgressAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const parsed = taskProgressSchema.safeParse({
    completionPercentage: formData.get('completionPercentage'),
    actualHours: formData.get('actualHours'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .update({
      completion_percentage: parsed.data.completionPercentage,
      actual_hours: parsed.data.actualHours,
    })
    .eq('id', taskId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshTask(taskId);
  return success('Progress saved.');
}

export async function reassignTaskAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const assignee = z.uuid().safeParse(formData.get('assigneeId'));
  if (!assignee.success) return failure('Choose who to assign this to.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .update({ assignee_id: assignee.data })
    .eq('id', taskId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshTask(taskId);
  return success('Task reassigned.');
}

export async function escalateTaskAction(
  taskId: string,
  escalateToId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const parsed = taskEscalationSchema.safeParse({ reason: formData.get('reason') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .update({ escalated_to: escalateToId, escalation_reason: parsed.data.reason })
    .eq('id', taskId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  await database.from('task_comments').insert({ task_id: taskId, body: `Escalated: ${parsed.data.reason}` });

  refreshTask(taskId);
  return success('Task escalated.');
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('tasks').delete().eq('id', taskId).select('id');

  if (error) {
    return isStillInUse(error) ? failure('Remove its subtasks first.') : databaseFailure(error);
  }
  if (data.length === 0) return failure('Only tasks that have not started can be removed.');

  revalidatePath('/tasks', 'layout');
  redirect('/tasks');
}

export async function addTaskCommentAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const parsed = taskCommentSchema.safeParse({ body: formData.get('body') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('task_comments').insert({ task_id: taskId, body: parsed.data.body });

  if (error) return databaseFailure(error);

  revalidatePath(`/tasks/${taskId}`);
  return success('Comment added.');
}

export async function addChecklistItemAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const parsed = checklistItemSchema.safeParse({ label: formData.get('label') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('task_checklist_items').insert({ task_id: taskId, label: parsed.data.label });

  if (error) return databaseFailure(error);

  revalidatePath(`/tasks/${taskId}`);
  return success('Item added.');
}

export async function setChecklistItemDoneAction(
  taskId: string,
  itemId: string,
  isDone: boolean,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('task_checklist_items')
    .update({ is_done: isDone })
    .eq('id', itemId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/tasks/${taskId}`);
  return success('Checklist updated.');
}

export async function deleteChecklistItemAction(taskId: string, itemId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('task_checklist_items').delete().eq('id', itemId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/tasks/${taskId}`);
  return success('Item removed.');
}

export async function addTaskDependencyAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const blocker = z.uuid().safeParse(formData.get('dependsOnTaskId'));
  if (!blocker.success) return failure('Choose a task.');

  const database = await createDatabaseClient();
  const { error } = await database
    .from('task_dependencies')
    .insert({ task_id: taskId, depends_on_task_id: blocker.data });

  if (error) return databaseFailure(error, 'This task is already linked.');

  revalidatePath(`/tasks/${taskId}`);
  return success('Dependency added.');
}

export async function removeTaskDependencyAction(taskId: string, blockerId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('task_dependencies')
    .delete()
    .eq('task_id', taskId)
    .eq('depends_on_task_id', blockerId)
    .select('task_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/tasks/${taskId}`);
  return success('Dependency removed.');
}

export async function addTaskCollaboratorAction(
  taskId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const employeeId = z.uuid().safeParse(formData.get('employeeId'));
  if (!employeeId.success) return failure('Choose someone to add.');

  const database = await createDatabaseClient();
  const { error } = await database
    .from('task_collaborators')
    .insert({ task_id: taskId, employee_id: employeeId.data });

  if (error) return databaseFailure(error, 'This person is already a collaborator.');

  revalidatePath(`/tasks/${taskId}`);
  return success('Collaborator added.');
}

export async function removeTaskCollaboratorAction(taskId: string, employeeId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('task_collaborators')
    .delete()
    .eq('task_id', taskId)
    .eq('employee_id', employeeId)
    .select('task_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/tasks/${taskId}`);
  return success('Collaborator removed.');
}
