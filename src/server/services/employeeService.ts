import 'server-only';
import { cache } from 'react';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { permissionKeys, type PermissionKey } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import type { CurrentAccess } from './accessService';

const employeeFields = `
  id, employee_code, full_name, work_email, phone, avatar_url, skills, joining_date,
  employment_status, is_active, invite_accepted_at, auth_user_id,
  role_id, designation_id, department_id, reporting_manager_id,
  employment_type_id, probation_months, probation_end_date, confirmation_date,
  role:roles(name),
  designation:designations(title),
  department:departments!employees_department_id_fkey(name),
  manager:reporting_manager_id(id, full_name),
  employment_type:employment_types(name)
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

// People in a role with private records, such as the Founder, are left out for anyone
// not in such a role themselves.
async function hiddenIds() {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_hidden_employee_ids');
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function canViewEmployeeProfile(access: CurrentAccess, employeeId: string) {
  const database = await createDatabaseClient();
  const [record, profile] = await Promise.all([
    database.rpc('can_see_employee_record', { p_employee: employeeId }),
    access.permissions[permissionKeys.employeesView] === 'organisation'
      ? Promise.resolve({ data: true })
      : database.rpc('can_view_employee_profile', { p_target: employeeId }),
  ]);
  return record.data === true && profile.data === true;
}

async function employeeQuery(access: CurrentAccess, { search, departmentId, roleId, accountStatus }: Omit<EmployeeFilters, 'page'>) {
  const database = await createDatabaseClient();
  const [ids, hidden] = await Promise.all([directoryIds(access), hiddenIds()]);

  let query = database.from('employees').select(employeeFields, { count: 'exact' }).order('full_name');
  if (ids) query = query.in('id', ids);
  if (hidden.length > 0) query = query.not('id', 'in', `(${hidden.join(',')})`);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) {
    query = query.or(`full_name.ilike.%${term}%,work_email.ilike.%${term}%,employee_code.ilike.%${term}%`);
  }
  if (departmentId) query = query.eq('department_id', departmentId);
  if (roleId) query = query.eq('role_id', roleId);
  if (accountStatus) query = query.eq('is_active', accountStatus === 'active');
  // Wrapped, because returning the query itself from an async function would run it.
  return { query };
}

export async function listEmployees(access: CurrentAccess, filters: EmployeeFilters) {
  const from = (filters.page - 1) * employeesPerPage;
  const { query } = await employeeQuery(access, filters);
  const { data, count, error } = await query.range(from, from + employeesPerPage - 1);
  if (error) throw error;

  return { employees: data, total: count ?? 0 };
}

// The directory as a spreadsheet: the same people and filters as the Employees page,
// work details only. Private details never go into the export.
export async function listEmployeesForExport(access: CurrentAccess, filters: Omit<EmployeeFilters, 'page'>) {
  const { query } = await employeeQuery(access, filters);
  const { data, error } = await query.range(0, 4999);
  if (error) throw error;
  return data;
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

// The extra roles someone can switch to, for whoever may assign roles to them.
export async function listExtraRoleIds(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('employee_extra_roles').select('role_id').eq('employee_id', employeeId);
  if (error) throw error;
  return data.map((row) => row.role_id);
}

// The roles the signed-in person can switch between, with the one in use marked.
// Once per request, however many parts of the page ask.
export const listMyRoles = cache(async function loadMyRoles() {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_my_roles');
  if (error) throw error;
  return data.map((row) => ({ id: row.role_id, name: row.name, isMain: row.is_main, isCurrent: row.is_current }));
});

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

// Who may see and change each part of the employee record. Mirrors the database rules:
// personal details for the person, HR and their managers; identity and bank details for
// the person (read only) and HR; documents for the person and HR.
export async function getEmployeeRecordAccess(access: CurrentAccess, employeeId: string) {
  const database = await createDatabaseClient();
  const isSelf = employeeId === access.employee.id;
  const [seesPersonal, managesEmployee, seesRecord] = await Promise.all([
    database.rpc('can_see_personal_details', { p_employee: employeeId }),
    isSelf
      ? Promise.resolve({ data: false })
      : database.rpc('can_access_employee', { p_permission: permissionKeys.employeesUpdate, p_target: employeeId }),
    database.rpc('can_see_employee_record', { p_employee: employeeId }),
  ]);
  // HR, for everyone whose record is not private to leadership.
  const isHr = access.permissions[permissionKeys.employeesPrivateView] === 'organisation' && seesRecord.data === true;

  return {
    isSelf,
    canSeePersonal: seesPersonal.data === true,
    // Date of birth and gender are changed by HR or a manager, never by the person.
    canEditPersonalFully: isHr || managesEmployee.data === true,
    canEditPersonal: seesPersonal.data === true,
    canSeePrivate: isSelf || isHr,
    canEditPrivate: isHr,
    canSeeDocuments: isSelf || isHr,
    canAddDocuments: (isSelf || isHr) && access.permissions[permissionKeys.filesUpload] !== undefined,
  };
}

export type EmployeeRecordAccess = Awaited<ReturnType<typeof getEmployeeRecordAccess>>;

export async function getPersonalDetails(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employee_personal_details')
    .select(
      'date_of_birth, gender, personal_email, address, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, updated_at',
    )
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PersonalDetails = NonNullable<Awaited<ReturnType<typeof getPersonalDetails>>>;

// Only the last four digits of the encrypted numbers ever leave this function.
export async function getPrivateDetails(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employee_private_details')
    .select('aadhaar_last4, pan, bank_name, account_last4, ifsc, account_holder, updated_at')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PrivateDetails = NonNullable<Awaited<ReturnType<typeof getPrivateDetails>>>;

// The encrypted value, read with the signed-in person's own access.
export async function getEncryptedDetail(employeeId: string, field: 'aadhaar' | 'account_number') {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employee_private_details')
    .select('aadhaar_encrypted, account_number_encrypted')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return (field === 'aadhaar' ? data?.aadhaar_encrypted : data?.account_number_encrypted) ?? null;
}

export async function listEmployeeDocuments(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .select('id, name, kind, size_bytes, document_type, created_at, owner_id, owner:employees!files_owner_id_fkey(full_name)')
    .eq('employee_id', employeeId)
    .eq('status', 'ready')
    .eq('is_archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getEmploymentHistory(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_employment_history', { p_employee: employeeId });
  if (error) throw error;
  return data;
}

export async function listEmploymentTypes() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employment_types')
    .select('id, name, is_active')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

// Mirrors guard_employee_update, so the page only offers what the database will accept.
export async function getEmployeeControls(access: CurrentAccess, employee: EmployeeDetails) {
  const database = await createDatabaseClient();
  const isSelf = employee.id === access.employee.id;

  const [canUpdate, canAssignRole, canDeactivate, canInvite, roleIsWithinReach, seesRecord] = await Promise.all([
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesUpdate, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesAssignRole, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesDeactivate, p_target: employee.id }),
    database.rpc('can_access_employee', { p_permission: permissionKeys.employeesCreate, p_target: employee.id }),
    database.rpc('role_is_assignable', { p_role: employee.role_id }),
    database.rpc('can_see_employee_record', { p_employee: employee.id }),
  ]);

  const withinReach = roleIsWithinReach.data === true && seesRecord.data === true;
  const updateScope = access.permissions[permissionKeys.employeesUpdate];

  return {
    canEdit: canUpdate.data === true && withinReach && (!isSelf || updateScope === 'organisation'),
    // The email they sign in with. Changed through change_employee_login_email.
    canChangeEmail: canUpdate.data === true && withinReach,
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
