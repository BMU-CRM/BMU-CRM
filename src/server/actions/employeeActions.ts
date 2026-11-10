'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateMyProfileSchema,
} from '@/lib/validation/employeeSchema';
import { sendInvitation, sendPasswordReset } from '@/server/auth/accountEmails';
import { createAuthUser, deleteAuthUser, EmailTakenError, setAuthUserBlocked } from '@/server/auth/authAccounts';
import { getAppDatabase } from '@/server/database/localDatabase';
import { getActionAccess } from '@/server/services/accessService';
import { getDefaultRole, getEmployee, getEmployeeControls } from '@/server/services/employeeService';

const noPermission = 'You do not have permission to do this.';

export async function createEmployeeAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.employeesCreate);
  if (!access) return failure(noPermission);

  const canChooseRole = access.permissions[permissionKeys.employeesAssignRole] !== undefined;
  const parsed = createEmployeeSchema.safeParse({
    fullName: formData.get('fullName'),
    workEmail: formData.get('workEmail'),
    phone: formData.get('phone') ?? '',
    roleId: canChooseRole ? (formData.get('roleId') ?? '') : undefined,
    designationId: formData.get('designationId') ?? '',
    departmentId: formData.get('departmentId') ?? '',
    reportingManagerId: formData.get('reportingManagerId') ?? '',
    joiningDate: formData.get('joiningDate') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();

  // Someone who cannot choose roles adds people with the default role. The database
  // applies the same rule, whatever is sent.
  const roleId = canChooseRole ? values.roleId : (await getDefaultRole())?.id;
  if (!roleId) return failure('No default role is set, so ask an administrator to add this person.');

  // Checked before the login is created, so a refused request leaves nothing behind.
  const [roleCheck, placementCheck] = await Promise.all([
    database.rpc('role_is_assignable', { p_role: roleId }),
    database.rpc('can_create_employee', {
      p_department: values.departmentId as string,
      p_manager: values.reportingManagerId as string,
    }),
  ]);
  if (roleCheck.data !== true) {
    return failure('You do not have permission to assign this role.');
  }
  if (placementCheck.data !== true) {
    return failure(
      access.permissions[permissionKeys.employeesCreate] === 'team'
        ? 'You can only add people to your own team, reporting to you or someone in your team.'
        : 'You can only add employees to your own department.',
    );
  }

  const existing = await database.from('employees').select('id').eq('work_email', values.workEmail).maybeSingle();
  if (existing.data) return failure('An employee with this work email already exists.');

  const db = await getAppDatabase();
  let authUserId: string;
  try {
    authUserId = await createAuthUser(db, { email: values.workEmail, fullName: values.fullName });
  } catch (error) {
    if (error instanceof EmailTakenError) return failure(error.message);
    console.error('Could not create the login', error);
    return failure('The login could not be created. Please try again.');
  }

  const { data: created, error } = await database
    .from('employees')
    .insert({
      auth_user_id: authUserId,
      full_name: values.fullName,
      work_email: values.workEmail,
      phone: values.phone,
      role_id: roleId,
      designation_id: values.designationId,
      department_id: values.departmentId,
      reporting_manager_id: values.reportingManagerId,
      joining_date: values.joiningDate,
    })
    .select('id')
    .single();

  if (error) {
    // Without an employee record the login is useless, so it is removed.
    await deleteAuthUser(db, authUserId);
    return databaseFailure(error, 'An employee with this work email already exists.');
  }

  await sendInvitation(db, { userId: authUserId, email: values.workEmail, name: values.fullName });

  revalidatePath('/people/employees');
  redirect(`/people/employees/${created.id}`);
}

export async function updateEmployeeAction(
  employeeId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);

  const employee = await getEmployee(employeeId);
  if (!employee) return failure('This employee could not be found.');

  const controls = await getEmployeeControls(access, employee);
  if (!controls.canEdit) return failure(noPermission);

  const parsed = updateEmployeeSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone') ?? '',
    designationId: formData.get('designationId') ?? '',
    departmentId: controls.canTransfer ? (formData.get('departmentId') ?? '') : (employee.department_id ?? ''),
    reportingManagerId: formData.get('reportingManagerId') ?? '',
    joiningDate: formData.get('joiningDate') ?? '',
    employmentStatus: formData.get('employmentStatus'),
    roleId: controls.canChangeRole ? formData.get('roleId') : undefined,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();

  const { error } = await database
    .from('employees')
    .update({
      full_name: values.fullName,
      phone: values.phone,
      designation_id: values.designationId,
      department_id: values.departmentId,
      reporting_manager_id: values.reportingManagerId,
      joining_date: values.joiningDate,
      employment_status: values.employmentStatus,
      ...(values.roleId ? { role_id: values.roleId } : {}),
    })
    .eq('id', employeeId);

  if (error) return databaseFailure(error);

  revalidatePath('/people', 'layout');
  redirect(`/people/employees/${employeeId}`);
}

export async function setEmployeeAccountActiveAction(
  employeeId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.employeesDeactivate);
  if (!access) return failure(noPermission);

  const employee = await getEmployee(employeeId);
  if (!employee) return failure('This employee could not be found.');

  const database = await createDatabaseClient();
  const { data: updated, error } = await database
    .from('employees')
    .update({ is_active: isActive })
    .eq('id', employeeId)
    .select('id');
  if (error) return databaseFailure(error);

  // Row level security reports a refused update as zero rows, not an error. The
  // admin call below must never run unless the user's own update really happened.
  if (updated.length === 0) return failure(noPermission);

  revalidatePath('/people', 'layout');

  if (employee.auth_user_id) {
    try {
      await setAuthUserBlocked(await getAppDatabase(), employee.auth_user_id, !isActive);
    } catch (blockError) {
      console.error('Could not update login status', blockError);
      return failure(
        isActive
          ? 'The record was activated, but sign-in could not be restored. Please try again.'
          : 'Data access was removed, but the login could not be blocked. Please try again.',
      );
    }
  }

  return success(isActive ? 'Account activated.' : 'Account deactivated.');
}

export type SignInLinkResult = { status: 'success'; link: string; kind: 'invite' | 'recovery' } | { status: 'error'; message: string };

// Creates a new invitation link, or a password reset link for someone who has already
// joined. Older links stop working. Email is not connected yet, so the link is also
// returned for the administrator to pass on.
export async function createSignInLinkAction(employeeId: string): Promise<SignInLinkResult> {
  const access = await getActionAccess(permissionKeys.employeesCreate);
  if (!access) return { status: 'error', message: noPermission };

  const employee = await getEmployee(employeeId);
  if (!employee) return { status: 'error', message: 'This employee could not be found.' };

  const controls = await getEmployeeControls(access, employee);
  if (!controls.canCreateSignInLink || !employee.auth_user_id) return { status: 'error', message: noPermission };

  const db = await getAppDatabase();
  const account = { userId: employee.auth_user_id, email: employee.work_email, name: employee.full_name };

  if (employee.invite_accepted_at === null) {
    return { status: 'success', kind: 'invite', link: await sendInvitation(db, account) };
  }
  return { status: 'success', kind: 'recovery', link: await sendPasswordReset(db, account) };
}

export async function updateMyProfileAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);

  const parsed = updateMyProfileSchema.safeParse({
    phone: formData.get('phone') ?? '',
    skills: formData.get('skills') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database
    .from('employees')
    .update({ phone: parsed.data.phone, skills: parsed.data.skills })
    .eq('id', access.employee.id);

  if (error) return databaseFailure(error);

  revalidatePath('/profile');
  return success('Your profile has been updated.');
}
