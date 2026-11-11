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
import {
  createEmployeeSchema,
  personalDetailsSchema,
  privateDetailsSchema,
  updateEmployeeSchema,
  updateMyProfileSchema,
} from '@/lib/validation/employeeSchema';
import { formatAadhaar } from '@/lib/employees/employeeRecordLabels';
import { sendInvitation, sendPasswordReset } from '@/server/auth/accountEmails';
import { createAuthUser, deleteAuthUser, EmailTakenError, setAuthUserBlocked } from '@/server/auth/authAccounts';
import { getAppDatabase } from '@/server/database/appDatabase';
import { decryptField, encryptField, isEncryptionReady } from '@/server/security/fieldEncryption';
import { getActionAccess } from '@/server/services/accessService';
import {
  getDefaultRole,
  getEmployee,
  getEmployeeControls,
  getEmployeeRecordAccess,
  getEncryptedDetail,
} from '@/server/services/employeeService';

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
    employmentTypeId: formData.get('employmentTypeId') ?? '',
    probationMonths: formData.get('probationMonths') ?? '',
    confirmationDate: formData.get('confirmationDate') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();

  const { data: updatedRows, error } = await database
    .from('employees')
    .update({
      full_name: values.fullName,
      phone: values.phone,
      designation_id: values.designationId,
      department_id: values.departmentId,
      reporting_manager_id: values.reportingManagerId,
      joining_date: values.joiningDate,
      employment_status: values.employmentStatus,
      employment_type_id: values.employmentTypeId,
      probation_months: values.probationMonths,
      confirmation_date: values.confirmationDate,
      ...(values.roleId ? { role_id: values.roleId } : {}),
    })
    .eq('id', employeeId)
    .select('id');

  if (error) return databaseFailure(error);
  if (updatedRows.length === 0) return failure(noPermission);

  // A second role, for someone who does two jobs. The database checks who may give it.
  if (controls.canChangeRole) {
    const extraRoles = z.array(z.uuid()).max(10).safeParse(formData.getAll('extraRoleIds'));
    if (!extraRoles.success) return failure('Choose valid additional roles.');
    const { error: rolesError } = await database.rpc('set_employee_extra_roles', {
      p_employee: employeeId,
      p_roles: extraRoles.data.filter((roleId) => roleId !== (values.roleId ?? employee.role_id)),
    });
    if (rolesError) return databaseFailure(rolesError);
  }

  revalidatePath('/people', 'layout');
  redirect(`/people/employees/${employeeId}`);
}

// Switches which of their roles the signed-in person is working in. Their access,
// sidebar and dashboard follow it, and the switch is recorded in the audit log.
export async function switchMyRoleAction(roleId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);
  const parsed = z.uuid().safeParse(roleId);
  if (!parsed.success) return failure('Choose one of your roles.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('switch_my_role', { p_role: parsed.data });
  if (error) return databaseFailure(error);

  revalidatePath('/', 'layout');
  return success('Role switched.');
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

export async function savePersonalDetailsAction(
  employeeId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);

  const recordAccess = await getEmployeeRecordAccess(access, employeeId);
  if (!recordAccess.canEditPersonal) return failure(noPermission);

  const parsed = personalDetailsSchema.safeParse({
    dateOfBirth: recordAccess.canEditPersonalFully ? (formData.get('dateOfBirth') ?? '') : undefined,
    gender: recordAccess.canEditPersonalFully ? (formData.get('gender') ?? '') : undefined,
    personalEmail: formData.get('personalEmail') ?? '',
    address: formData.get('address') ?? '',
    emergencyContactName: formData.get('emergencyContactName') ?? '',
    emergencyContactRelation: formData.get('emergencyContactRelation') ?? '',
    emergencyContactPhone: formData.get('emergencyContactPhone') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employee_personal_details')
    .upsert(
      {
        employee_id: employeeId,
        ...(values.dateOfBirth !== undefined ? { date_of_birth: values.dateOfBirth } : {}),
        ...(values.gender !== undefined ? { gender: values.gender } : {}),
        personal_email: values.personalEmail,
        address: values.address,
        emergency_contact_name: values.emergencyContactName,
        emergency_contact_relation: values.emergencyContactRelation,
        emergency_contact_phone: values.emergencyContactPhone,
      },
      { onConflict: 'employee_id' },
    )
    .select('employee_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/people/employees/${employeeId}`);
  revalidatePath('/profile');
  // People without Directory access see their own record on My profile.
  redirect(recordAccess.isSelf ? '/profile' : `/people/employees/${employeeId}?tab=personal`);
}

// Saves identity and bank details. Aadhaar and account numbers are encrypted here, on
// the server, and only their last four digits are stored in plain text. An empty box
// keeps the saved number, because saved numbers are never sent back to the browser.
export async function savePrivateDetailsAction(
  employeeId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.employeesPrivateView);
  if (!access) return failure(noPermission);

  const parsed = privateDetailsSchema.safeParse({
    aadhaar: formData.get('aadhaar') ?? '',
    pan: formData.get('pan') ?? '',
    bankName: formData.get('bankName') ?? '',
    accountNumber: formData.get('accountNumber') ?? '',
    ifsc: formData.get('ifsc') ?? '',
    accountHolder: formData.get('accountHolder') ?? '',
    clearAadhaar: formData.get('clearAadhaar') === 'on',
    clearAccountNumber: formData.get('clearAccountNumber') === 'on',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  if ((values.aadhaar || values.accountNumber) && !isEncryptionReady()) {
    return failure('Aadhaar and account numbers cannot be saved until encryption is set up. Ask the administrator to add FIELD_ENCRYPTION_KEY.');
  }

  const row: Record<string, string | null> = {
    employee_id: employeeId,
    pan: values.pan,
    bank_name: values.bankName,
    ifsc: values.ifsc,
    account_holder: values.accountHolder,
  };
  if (values.aadhaar) {
    row.aadhaar_encrypted = encryptField(values.aadhaar);
    row.aadhaar_last4 = values.aadhaar.slice(-4);
  } else if (values.clearAadhaar) {
    row.aadhaar_encrypted = null;
    row.aadhaar_last4 = null;
  }
  if (values.accountNumber) {
    row.account_number_encrypted = encryptField(values.accountNumber);
    row.account_last4 = values.accountNumber.slice(-4);
  } else if (values.clearAccountNumber) {
    row.account_number_encrypted = null;
    row.account_last4 = null;
  }

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('employee_private_details')
    .upsert(row as { employee_id: string }, { onConflict: 'employee_id' })
    .select('employee_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/people/employees/${employeeId}`);
  redirect(`/people/employees/${employeeId}?tab=private`);
}

export type RevealResult = { status: 'success'; value: string } | { status: 'error'; message: string };

// Shows one full number. The database records who looked, and refuses anyone without
// access, before anything is decrypted.
export async function revealPrivateDetailAction(employeeId: string, field: 'aadhaar' | 'account_number'): Promise<RevealResult> {
  if (!(await getActionAccess())) return { status: 'error', message: noPermission };
  if (field !== 'aadhaar' && field !== 'account_number') return { status: 'error', message: noPermission };
  if (!isEncryptionReady()) {
    return { status: 'error', message: 'Encryption is not set up, so this number cannot be shown.' };
  }

  const database = await createDatabaseClient();
  const { error } = await database.rpc('record_private_detail_reveal', { p_employee: employeeId, p_field: field });
  if (error) return { status: 'error', message: noPermission };

  const stored = await getEncryptedDetail(employeeId, field);
  if (!stored) return { status: 'error', message: 'Nothing is saved yet.' };

  try {
    const plain = decryptField(stored);
    return { status: 'success', value: field === 'aadhaar' ? formatAadhaar(plain) : plain };
  } catch (decryptError) {
    console.error('Could not decrypt a private detail', decryptError instanceof Error ? decryptError.message : 'unknown');
    return { status: 'error', message: 'This number could not be read. The encryption key may have changed.' };
  }
}

// Archives a document. Only whoever added it can, as with any file.
export async function removeEmployeeDocumentAction(employeeId: string, fileId: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .update({ is_archived: true })
    .eq('id', fileId)
    .eq('employee_id', employeeId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/people/employees/${employeeId}`);
  revalidatePath('/profile');
  return success('Document removed.');
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
