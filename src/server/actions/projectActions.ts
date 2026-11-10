'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { milestoneSchema, projectSchema } from '@/lib/validation/workSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function saveProjectAction(
  projectId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess(projectId ? permissionKeys.projectsUpdate : permissionKeys.projectsCreate);
  if (!access) return failure(noPermission);

  const parsed = projectSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    clientId: formData.get('clientId') ?? '',
    departmentId: formData.get('departmentId') ?? '',
    projectManagerId: formData.get('projectManagerId') ?? '',
    status: formData.get('status'),
    priority: formData.get('priority'),
    startDate: formData.get('startDate') ?? '',
    dueDate: formData.get('dueDate') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    name: values.name,
    description: values.description,
    client_id: values.clientId,
    department_id: values.departmentId,
    project_manager_id: values.projectManagerId,
    status: values.status,
    priority: values.priority,
    start_date: values.startDate,
    due_date: values.dueDate,
  };

  const database = await createDatabaseClient();
  let savedId = projectId;

  if (projectId) {
    const { data, error } = await database.from('projects').update(row).eq('id', projectId).select('id');
    if (error) return databaseFailure(error);
    if (data.length === 0) return failure(noPermission);
  } else {
    const { data, error } = await database
      .from('projects')
      .insert({ ...row, project_manager_id: row.project_manager_id ?? access.employee.id })
      .select('id')
      .single();
    if (error) return databaseFailure(error);
    savedId = data.id;
  }

  revalidatePath('/projects', 'layout');
  redirect(`/projects/${savedId}`);
}

export async function addProjectMemberAction(
  projectId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.projectsUpdate))) return failure(noPermission);

  const employeeId = z.uuid().safeParse(formData.get('employeeId'));
  if (!employeeId.success) return failure('Choose someone to add.');

  const database = await createDatabaseClient();
  const { error } = await database
    .from('project_members')
    .insert({ project_id: projectId, employee_id: employeeId.data });

  if (error) return databaseFailure(error, 'This person is already on the team.');

  revalidatePath(`/projects/${projectId}`);
  return success('Added to the team.');
}

export async function removeProjectMemberAction(projectId: string, employeeId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.projectsUpdate))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('employee_id', employeeId)
    .select('employee_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/projects/${projectId}`);
  return success('Removed from the team.');
}

export async function addMilestoneAction(
  projectId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.projectsUpdate))) return failure(noPermission);

  const parsed = milestoneSchema.safeParse({
    title: formData.get('title'),
    dueDate: formData.get('dueDate') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database
    .from('project_milestones')
    .insert({ project_id: projectId, title: parsed.data.title, due_date: parsed.data.dueDate });

  if (error) return databaseFailure(error);

  revalidatePath(`/projects/${projectId}`);
  return success('Milestone added.');
}

export async function setMilestoneDoneAction(
  projectId: string,
  milestoneId: string,
  isDone: boolean,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.projectsUpdate))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('project_milestones')
    .update({ completed_at: isDone ? new Date().toISOString() : null })
    .eq('id', milestoneId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/projects/${projectId}`);
  return success('Milestone updated.');
}

export async function deleteMilestoneAction(projectId: string, milestoneId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.projectsUpdate))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('project_milestones').delete().eq('id', milestoneId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/projects/${projectId}`);
  return success('Milestone removed.');
}
