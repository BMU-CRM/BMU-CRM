import 'server-only';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';

// A department-scoped user sees figures for their own department only.
function statsDepartmentFilter(access: CurrentAccess) {
  return access.permissions[permissionKeys.organisationStats] === 'organisation'
    ? null
    : access.employee.department_id;
}

async function loadScopedEmployees(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const departmentId = statsDepartmentFilter(access);

  let query = database
    .from('employees')
    .select('id, is_active, invite_accepted_at, department_id, department:departments!employees_department_id_fkey(name)');

  if (departmentId) query = query.eq('department_id', departmentId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getOrganisationStats(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const employees = await loadScopedEmployees(access);
  const isOrganisationWide = statsDepartmentFilter(access) === null;

  const { count, error } = await database
    .from('departments')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (error) throw error;

  const active = employees.filter((employee) => employee.is_active);

  return {
    isOrganisationWide,
    totalEmployees: employees.length,
    activeEmployees: active.length,
    pendingInvitations: active.filter((employee) => employee.invite_accepted_at === null).length,
    activeDepartments: count ?? 0,
  };
}

export async function getDepartmentHeadcount(access: CurrentAccess) {
  const employees = await loadScopedEmployees(access);
  const counts = new Map<string, number>();

  for (const employee of employees) {
    if (!employee.is_active) continue;
    const name = employee.department?.name ?? 'No department';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([department, headcount]) => ({ department, headcount }))
    .sort((first, second) => second.headcount - first.headcount);
}

export async function listMyTeam() {
  const database = await createDatabaseClient();

  const teamIds = await database.rpc('get_my_team_ids');
  if (teamIds.error) throw teamIds.error;

  const { data, error } = await database
    .from('employees')
    .select('id, full_name, designation:designations(title)')
    .in('id', teamIds.data)
    .eq('is_active', true)
    .order('full_name');

  if (error) throw error;
  return data;
}
