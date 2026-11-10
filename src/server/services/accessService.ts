import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { PermissionKey, PermissionMap } from '@/lib/access/permissionKeys';
import { getSessionUser } from '@/server/auth/currentSession';
import { createDatabaseClient } from '@/server/database/databaseClient';

async function loadCurrentAccess() {
  const user = await getSessionUser();
  if (!user) return { status: 'signed-out' as const };
  if (user.blocked) return { status: 'no-employee' as const };

  const database = await createDatabaseClient();

  const [employeeResult, permissionResult] = await Promise.all([
    database
      .from('employees')
      .select(
        `id, employee_code, full_name, work_email, department_id, avatar_url,
         role:roles(name),
         designation:designations(title),
         department:departments!employees_department_id_fkey(name)`,
      )
      .eq('auth_user_id', user.userId)
      .eq('is_active', true)
      .maybeSingle(),
    database.rpc('get_my_permissions'),
  ]);

  if (employeeResult.error) throw employeeResult.error;
  if (permissionResult.error) throw permissionResult.error;
  if (!employeeResult.data) return { status: 'no-employee' as const };

  const permissions: PermissionMap = Object.fromEntries(
    permissionResult.data.map((row) => [row.permission_key, row.scope]),
  );

  return { status: 'ready' as const, employee: employeeResult.data, permissions };
}

// Runs once per request, however many components ask for it.
export const getCurrentAccess = cache(loadCurrentAccess);

export type CurrentAccess = Extract<Awaited<ReturnType<typeof loadCurrentAccess>>, { status: 'ready' }>;

export async function requireAccess(): Promise<CurrentAccess> {
  const access = await getCurrentAccess();

  // The route guard only checks that a session cookie exists. "signed-out" here means
  // the session behind it has ended, so the cookie is cleared before signing in again.
  if (access.status === 'signed-out') redirect('/auth/end-session');
  // A blocked account, or one whose employee record is inactive.
  if (access.status !== 'ready') redirect('/account-inactive');
  return access;
}

// A page the user may not open looks the same as a page that does not exist.
export async function requirePagePermission(permission: PermissionKey): Promise<CurrentAccess> {
  const access = await requireAccess();

  if (access.permissions[permission] === undefined) notFound();
  return access;
}

export async function getActionAccess(permission?: PermissionKey): Promise<CurrentAccess | null> {
  const access = await getCurrentAccess();

  if (access.status !== 'ready') return null;
  if (permission && access.permissions[permission] === undefined) return null;
  return access;
}
