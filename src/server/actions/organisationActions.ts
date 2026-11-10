'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  databaseFailure,
  failure,
  isStillInUse,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys, permissionScopes, type PermissionScope } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { departmentSchema, designationSchema, roleSchema } from '@/lib/validation/organisationSchema';
import { getActionAccess } from '@/server/services/accessService';
import { listPermissions } from '@/server/services/organisationService';

const noPermission = 'You do not have permission to do this.';

function departmentValues(formData: FormData) {
  return departmentSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    parentDepartmentId: formData.get('parentDepartmentId') ?? '',
    headEmployeeId: formData.get('headEmployeeId') ?? '',
  });
}

export async function saveDepartmentAction(
  departmentId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.departmentsManage))) return failure(noPermission);

  const parsed = departmentValues(formData);
  if (!parsed.success) return validationFailure(parsed.error);

  const row = {
    name: parsed.data.name,
    description: parsed.data.description,
    parent_department_id: parsed.data.parentDepartmentId,
    head_employee_id: parsed.data.headEmployeeId,
  };

  const database = await createDatabaseClient();
  const { error } = departmentId
    ? await database.from('departments').update(row).eq('id', departmentId)
    : await database.from('departments').insert(row);

  if (error) return databaseFailure(error, 'A department with this name already exists.');

  revalidatePath('/people', 'layout');
  redirect('/people/departments');
}

export async function deleteDepartmentAction(departmentId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.departmentsManage))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = await database.from('departments').delete().eq('id', departmentId);

  if (error) {
    return isStillInUse(error)
      ? failure('This department still has employees. Move them first.')
      : databaseFailure(error);
  }

  revalidatePath('/people', 'layout');
  return success('Department removed.');
}

export async function saveDesignationAction(
  designationId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.designationsManage))) return failure(noPermission);

  const parsed = designationSchema.safeParse({
    title: formData.get('title'),
    managementLevel: formData.get('managementLevel'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { title: parsed.data.title, management_level: parsed.data.managementLevel };

  const database = await createDatabaseClient();
  const { error } = designationId
    ? await database.from('designations').update(row).eq('id', designationId)
    : await database.from('designations').insert(row);

  if (error) return databaseFailure(error, 'A designation with this title already exists.');

  revalidatePath('/people', 'layout');
  redirect('/people/designations');
}

export async function deleteDesignationAction(designationId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.designationsManage))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = await database.from('designations').delete().eq('id', designationId);

  if (error) {
    return isStillInUse(error)
      ? failure('Employees still hold this designation. Change theirs first.')
      : databaseFailure(error);
  }

  revalidatePath('/people', 'layout');
  return success('Designation removed.');
}

function isPermissionScope(value: FormDataEntryValue | null): value is PermissionScope {
  return typeof value === 'string' && permissionScopes.includes(value as PermissionScope);
}

async function selectedPermissions(formData: FormData) {
  const catalogue = await listPermissions();

  return catalogue.flatMap((permission) => {
    const scope = formData.get(`permission:${permission.key}`);
    return isPermissionScope(scope) ? [{ key: permission.key, scope }] : [];
  });
}

export async function saveRoleAction(
  roleId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.rolesManage))) return failure(noPermission);

  const parsed = roleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  let savedRoleId = roleId;

  if (roleId) {
    const { error } = await database.from('roles').update(parsed.data).eq('id', roleId);
    if (error) return databaseFailure(error, 'A role with this name already exists.');
  } else {
    const { data, error } = await database.from('roles').insert(parsed.data).select('id').single();
    if (error) return databaseFailure(error, 'A role with this name already exists.');
    savedRoleId = data.id;
  }

  const { error: permissionError } = await database.rpc('set_role_permissions', {
    p_role: savedRoleId as string,
    p_permissions: await selectedPermissions(formData),
  });
  if (permissionError) return databaseFailure(permissionError);

  revalidatePath('/settings/roles', 'layout');
  redirect('/settings/roles');
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.rolesManage))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error, count } = await database.from('roles').delete({ count: 'exact' }).eq('id', roleId);

  if (error) {
    return isStillInUse(error)
      ? failure('Employees still have this role. Change theirs first.')
      : databaseFailure(error);
  }
  if (count === 0) return failure('This role cannot be removed.');

  revalidatePath('/settings/roles', 'layout');
  return success('Role removed.');
}
