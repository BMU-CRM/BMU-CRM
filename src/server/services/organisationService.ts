import 'server-only';
import { createDatabaseClient } from '@/server/database/databaseClient';

export async function listDepartments() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('departments')
    .select(
      `id, name, description, parent_department_id, head_employee_id, is_active,
       parent:parent_department_id(name),
       head:employees!departments_head_employee_fk(id, full_name)`,
    )
    .order('name');

  if (error) throw error;
  return data;
}

export async function getDepartment(departmentId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('departments')
    .select('id, name, description, parent_department_id, head_employee_id')
    .eq('id', departmentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listDesignations() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('designations')
    .select('id, title, management_level, is_active')
    .order('management_level')
    .order('title');

  if (error) throw error;
  return data;
}

export async function getDesignation(designationId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('designations')
    .select('id, title, management_level')
    .eq('id', designationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listRoles() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('roles')
    .select('id, name, description, is_protected, is_active, role_permissions(count), employees(count)')
    .order('name');

  if (error) throw error;
  return data;
}

export async function listAssignableRoles() {
  const database = await createDatabaseClient();

  const assignable = await database.rpc('get_assignable_role_ids');
  if (assignable.error) throw assignable.error;

  const { data, error } = await database
    .from('roles')
    .select('id, name')
    .in('id', assignable.data)
    .order('name');

  if (error) throw error;
  return data;
}

export async function getRoleWithPermissions(roleId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('roles')
    .select('id, name, description, is_protected, role_permissions(permission_key, scope)')
    .eq('id', roleId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listPermissions() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('permissions')
    .select('key, module, label, description, allowed_scopes')
    .order('sort_order');

  if (error) throw error;
  return data;
}

export type PermissionRow = Awaited<ReturnType<typeof listPermissions>>[number];
