import 'server-only';
import { databaseFailure } from '@/lib/actionResult';
import { sendInvitation } from '@/server/auth/accountEmails';
import { createAuthUser, deleteAuthUser, EmailTakenError } from '@/server/auth/authAccounts';
import { getAppDatabase } from '@/server/database/appDatabase';
import { createDatabaseClient } from '@/server/database/databaseClient';

export type NewEmployee = {
  fullName: string;
  workEmail: string;
  phone: string | null;
  roleId: string;
  designationId: string | null;
  departmentId: string | null;
  reportingManagerId: string | null;
  joiningDate: string | null;
};

export type EmployeeCreation = { status: 'created'; id: string } | { status: 'error'; message: string };

// Creates the login and the employee record, then the invitation, as Add employee does.
// The caller checks permission, role and placement first. If the record cannot be
// saved, the login is removed so nothing is left behind.
export async function createEmployeeWithLogin(values: NewEmployee): Promise<EmployeeCreation> {
  const database = await createDatabaseClient();
  const existing = await database.from('employees').select('id').eq('work_email', values.workEmail).maybeSingle();
  if (existing.data) return { status: 'error', message: 'An employee with this work email already exists.' };

  const db = await getAppDatabase();
  let authUserId: string;
  try {
    authUserId = await createAuthUser(db, { email: values.workEmail, fullName: values.fullName });
  } catch (error) {
    if (error instanceof EmailTakenError) return { status: 'error', message: error.message };
    console.error('Could not create the login', error);
    return { status: 'error', message: 'The login could not be created. Please try again.' };
  }

  const { data: created, error } = await database
    .from('employees')
    .insert({
      auth_user_id: authUserId,
      full_name: values.fullName,
      work_email: values.workEmail,
      phone: values.phone,
      role_id: values.roleId,
      designation_id: values.designationId,
      department_id: values.departmentId,
      reporting_manager_id: values.reportingManagerId,
      joining_date: values.joiningDate,
    })
    .select('id')
    .single();

  if (error) {
    await deleteAuthUser(db, authUserId);
    return { status: 'error', message: databaseFailure(error, 'An employee with this work email already exists.').message ?? 'The employee could not be added.' };
  }

  await sendInvitation(db, { userId: authUserId, email: values.workEmail, name: values.fullName });
  return { status: 'created', id: created.id };
}
