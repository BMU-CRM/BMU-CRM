import 'server-only';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { permissionKeys, type PermissionKey } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import type { CurrentAccess } from './accessService';

const employeeFields = `
  id, employee_code, full_name, work_email, phone, avatar_url, skills, joining_date,
  employment_status, is_active, invite_accepted_at, auth_user_id,
  role_id, designation_id, department_id, reporting_manager_id,
  role:roles(name),
  designation:designations(title),
  department:departments!employees_department_id_fkey(name),
  manager:reporting_manager_id(id, full_name)
`;

export const employeesPerPage = 25;

export type EmployeeFilters = {
  search?: string;
  departmentId?: string;
  roleId?: string;
  accountStatus?: 'active' | 'inactive';
  page: number;
};

// Who appears in Employees follows the scope of employees.view: everyone, the person's
// team, or their manager and colleagues. The database decides, in can_view_employee_profile.
async function directoryIds(access: CurrentAccess) {
  if (access.permissions[permissionKeys.employeesView] === 'organisation') return null;
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_directory_employee_ids');
  if (error) throw error;
  return data;
}

export async function canViewEmployeeProfile(access: CurrentAccess, employeeId: string) {
  if (access.permissions[permissionKeys.employeesView] === 'organisation') return true;
  const database = await createDatabaseClient();
  const { data } = await database.rpc('can_view_employee_profile', { p_target: employeeId });
  return data === true;
}

export async function listEmployees(access: CurrentAccess, { search, departmentId, roleId, accountStatus, page }: EmployeeFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * employeesPerPage;
  const ids = await directoryIds(access);

  let query = database
    .from('employees')
    .select(employeeFields, { count: 'exact' })
    .order('full_name')
    .range(from, from + employeesPerPage - 1);
  if (ids) query = query.in('id', ids);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,work_email.ilike.%${term}%,employee_code.ilike.%${term}%`);
  }
  if (departmentId) query = query.eq('department_id', departmentId);
  if (roleId) query = query.eq('role_id', roleId);
  if (accountStatus) query = query.eq('is_active', accountStatus === 'active');

  const { data, count, error } = await query;
  if (error) throw error;

  return { employees: data, total: count ?? 0 };
}

export async function getEmployee(employeeId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('employees')
    .select(employeeFields)
    .eq('id', employeeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type EmployeeDetails = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

export async function listDirectReports(employeeId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('employees')
    .select('id, full_name, designation:designations(title)')
    .eq('reporting_manager_id', employeeId)
    .eq('is_active', true)
    .order('full_name');

  if (error) throw error;
  return data;
}

export async function listEmployeeOptions() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name');

  if (error) throw error;
  return data;
}

// The people a new or moved employee may report to. Team scope keeps it inside the
// person's own team, as the database does.
export async function listManagerOptions(access: CurrentAccess, permission: PermissionKey) {
  const everyone = await listEmployeeOptions();
  if (access.permissions[permission] !== 'team') return everyone;

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_my_team_ids');
  if (error) throw error;
  const team = new Set([access.employee.id, ...data]);
  return everyone.filter((person) => team.has(person.id));
}

// The role given to people added by someone who cannot choose roles.
export async function getDefaultRole() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('roles').select('id, name').eq('is_default', true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listHierarchyPeople() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('employees')
    .select(
      `id, full_name, reporting_manager_id,
       designation:designations(title, management_level),
       department:departments!employees_department_id_fkey(name)`,
    )
    .eq('is_active', true)
    .order('full_name');

  if (error) throw error;
  return data;
}

// Mirrors guard_employee_update, so the page only offers what the database will accept.
export async function getEmployeeControls(access: CurrentAccess, employee: EmployeeDetails) {
  const database = await createDatabaseClient();
  const isSelf = employee.id === access.employee.id;

  const [canUpdate, canAssignRole, canDeactivate, canInvite, roleIsWithinReach] = await Promise.all([
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesUpdate, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesAssignRole, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesDeactivate, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesCreate, p_target: employee.id }),
    database.rpc('role_is_assignable', { p_role: employee.role_id }),
  ]);

  const withinReach = roleIsWithinReach.data === true;
  const updateScope = access.permissions[permissionKeys.employeesUpdate];

  return {
    canEdit: canUpdate.data === true && withinReach && (!isSelf || updateScope === 'organisation'),
    canTransfer: updateScope === 'organisation',
    canChangeRole: canAssignRole.data === true && withinReach && !isSelf,
    canChangeAccount: canDeactivate.data === true && withinReach && !isSelf,
    // An invitation link for someone who has not joined, or a password reset link. Only
    // for people within reach of employees.create, so a head can only do it for their team.
    canCreateSignInLink:
      canInvite.data === true &&
      employee.is_active &&
      withinReach &&
      !isSelf,
  };
}
