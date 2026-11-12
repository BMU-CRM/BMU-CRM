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
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseAttendanceCsv } from '@/lib/attendance/summariseAttendance';
import { createDatabaseClient } from '@/server/database/databaseClient';
import {
  attendanceCorrectionSchema,
  employmentTypeSchema,
  holidaySchema,
  leaveDecisionSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  workingHoursSchema,
} from '@/lib/validation/hrSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function requestLeaveAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.leaveRequest);
  if (!access) return failure(noPermission);

  const parsed = leaveRequestSchema.safeParse({
    leaveTypeId: formData.get('leaveTypeId'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate') || formData.get('startDate'),
    isHalfDay: formData.get('isHalfDay') === 'on',
    reason: formData.get('reason'),
    attachmentFileId: formData.get('attachmentFileId') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  // The database sets the employee from the session anyway. This only satisfies the types.
  const { error } = await database.from('leave_requests').insert({
    employee_id: access.employee.id,
    leave_type_id: values.leaveTypeId,
    start_date: values.startDate,
    end_date: values.endDate,
    is_half_day: values.isHalfDay,
    reason: values.reason,
    attachment_file_id: values.attachmentFileId,
  });

  if (error) return databaseFailure(error);

  revalidatePath('/leave');
  return success('Your request has been sent for approval.');
}

export async function decideLeaveAction(requestId: string, decision: string, note: string): Promise<ActionResult> {
  const parsed = leaveDecisionSchema.safeParse({ decision, note });
  if (!parsed.success) return failure('Choose approve or reject.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_requests')
    .update({ status: parsed.data.decision, decision_note: parsed.data.note })
    .eq('id', requestId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/approvals');
  revalidatePath('/hr/leave');
  return success(parsed.data.decision === 'approved' ? 'Leave approved.' : 'Leave rejected.');
}

export async function cancelLeaveAction(requestId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/leave');
  return success('Leave cancelled.');
}

// Where the person is working today is chosen as they check in.
export async function checkInAction(workMode: 'office' | 'wfh'): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.rpc('attendance_check_in', { p_work_mode: workMode === 'wfh' ? 'wfh' : 'office' });
  if (error) return databaseFailure(error);

  revalidatePath('/', 'layout');
  return success(workMode === 'wfh' ? 'Checked in, working from home.' : 'Checked in.');
}

export async function checkOutAction(): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.rpc('attendance_check_out');
  if (error) return databaseFailure(error);

  revalidatePath('/', 'layout');
  return success('Checked out.');
}

export async function startBreakAction(): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.rpc('attendance_start_break');
  if (error) return databaseFailure(error);

  revalidatePath('/attendance');
  return success('Break started.');
}

export async function endBreakAction(): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.rpc('attendance_end_break');
  if (error) return databaseFailure(error);

  revalidatePath('/attendance');
  return success('Welcome back.');
}

function indiaTimestamp(date: string, clock: string) {
  return clock ? `${date}T${clock}:00+05:30` : null;
}

export async function correctAttendanceAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.attendanceManage))) return failure(noPermission);

  const parsed = attendanceCorrectionSchema.safeParse({
    employeeId: formData.get('employeeId'),
    workDate: formData.get('workDate'),
    checkIn: formData.get('checkIn') ?? '',
    checkOut: formData.get('checkOut') ?? '',
    workMode: formData.get('workMode') || 'office',
    statusOverride: formData.get('statusOverride') ?? '',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { employeeId, workDate, checkIn, checkOut, workMode, statusOverride, note } = parsed.data;
  if (checkIn && checkOut && checkOut < checkIn) {
    return { status: 'error', message: 'Check-out must be after check-in.', fieldErrors: { checkOut: 'Must be after check-in.' } };
  }

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('attendance_records')
    .upsert(
      {
        employee_id: employeeId,
        work_date: workDate,
        check_in_at: indiaTimestamp(workDate, checkIn),
        check_out_at: indiaTimestamp(workDate, checkOut),
        work_mode: workMode,
        status_override: statusOverride,
        note,
      },
      { onConflict: 'employee_id,work_date' },
    )
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/attendance', 'layout');
  return success('Attendance corrected.');
}

export async function importAttendanceAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.attendanceManage))) return failure(noPermission);

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return failure('Choose a CSV file.');
  if (file.size > 2 * 1024 * 1024) return failure('The file can be up to 2 MB.');

  const { rows, error: parseError } = parseAttendanceCsv(await file.text());
  if (parseError) return failure(parseError);
  if (rows.length === 0) return failure('The file has no rows to import.');

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('import_attendance', { p_rows: rows });
  if (error) return databaseFailure(error);

  const result = data as { imported: number; errors: { line: number; error: string }[] };
  revalidatePath('/attendance', 'layout');

  if (result.errors.length === 0) return success(`Imported ${result.imported} rows.`);

  const examples = result.errors
    .slice(0, 3)
    .map((problem) => `row ${problem.line + 1}: ${problem.error}`)
    .join('; ');
  return {
    status: result.imported > 0 ? 'success' : 'error',
    message: `Imported ${result.imported} rows. ${result.errors.length} could not be imported (${examples}).`,
  };
}

export async function saveWorkingHoursAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);

  const parsed = workingHoursSchema.safeParse({
    workStart: formData.get('workStart'),
    workEnd: formData.get('workEnd'),
    lateGraceMinutes: formData.get('lateGraceMinutes'),
    workingDays: formData.getAll('workingDays'),
    overtimeAfterHours: formData.get('overtimeAfterHours') ?? '',
    halfDayHours: formData.get('halfDayHours') ?? '',
    defaultProbationMonths: formData.get('defaultProbationMonths') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const toMinutes = (hours: number | null) => (hours === null ? null : Math.round(hours * 60));
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('company_settings')
    .update({
      work_start: parsed.data.workStart,
      work_end: parsed.data.workEnd,
      late_grace_minutes: parsed.data.lateGraceMinutes,
      working_days: parsed.data.workingDays,
      overtime_after_minutes: toMinutes(parsed.data.overtimeAfterHours),
      half_day_minutes: toMinutes(parsed.data.halfDayHours),
      default_probation_months: parsed.data.defaultProbationMonths,
    })
    .eq('id', true)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr');
  return success('Working hours saved.');
}

// Adds a holiday, or changes one when an id is given, then goes back to that month.
export async function saveHolidayAction(holidayId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);

  const parsed = holidaySchema.safeParse({
    holidayDate: formData.get('holidayDate'),
    name: formData.get('name'),
    kind: formData.get('kind'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = {
    holiday_date: parsed.data.holidayDate,
    name: parsed.data.name,
    kind: parsed.data.kind,
    description: parsed.data.description,
  };
  const database = await createDatabaseClient();
  const { data, error } = holidayId
    ? await database.from('holidays').update(row).eq('id', holidayId).select('id')
    : await database.from('holidays').insert(row).select('id');
  if (error) return databaseFailure(error, 'There is already a holiday on that date.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/hr/holidays', 'layout');
  revalidatePath('/settings/hr');
  redirect(`/hr/holidays?month=${parsed.data.holidayDate.slice(0, 7)}`);
}

export async function removeHolidayAction(holidayId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('holidays').delete().eq('id', holidayId).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/hr/holidays', 'layout');
  return success('Holiday removed.');
}

export async function saveEmploymentTypeAction(
  employmentTypeId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);

  const parsed = employmentTypeSchema.safeParse({
    name: formData.get('name'),
    isActive: employmentTypeId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = employmentTypeId
    ? await database.from('employment_types').update(row).eq('id', employmentTypeId).select('id')
    : await database.from('employment_types').insert(row).select('id');

  if (error) return databaseFailure(error, 'An employment type with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr');
  return success(employmentTypeId ? 'Employment type saved.' : 'Employment type added.');
}

// Moves unused leave from last year into this one. The same job runs by itself early on
// 1 January; running it again recalculates instead of adding twice.
export async function carryForwardLeaveAction(year: number): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);
  if (!Number.isInteger(year)) return failure('Choose a year.');

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('carry_forward_leave', { p_year: year });
  if (error) return databaseFailure(error);

  revalidatePath('/hr/leave', 'layout');
  revalidatePath('/leave');
  return success(`Carried forward unused ${year} leave for ${data} ${data === 1 ? 'balance' : 'balances'}.`);
}

export async function saveLeaveTypeAction(
  leaveTypeId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);

  const parsed = leaveTypeSchema.safeParse({
    name: formData.get('name'),
    yearlyAllowance: formData.get('yearlyAllowance') ?? '',
    isPaid: formData.get('isPaid') === 'on',
    requiresAttachment: formData.get('requiresAttachment') === 'on',
    isActive: leaveTypeId ? formData.get('isActive') === 'on' : true,
    carryForwardCap: formData.get('carryForwardCap') ?? '',
    carryForwardExpiryMonths: formData.get('carryForwardExpiryMonths') ?? '',
    isEncashable: formData.get('isEncashable') === 'on',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = {
    name: parsed.data.name,
    yearly_allowance: parsed.data.yearlyAllowance,
    is_paid: parsed.data.isPaid,
    requires_attachment: parsed.data.requiresAttachment,
    is_active: parsed.data.isActive,
    carry_forward_cap: parsed.data.carryForwardCap,
    carry_forward_expiry_months: parsed.data.carryForwardCap === null ? null : parsed.data.carryForwardExpiryMonths,
    is_encashable: parsed.data.isEncashable,
  };

  const database = await createDatabaseClient();
  const { data, error } = leaveTypeId
    ? await database.from('leave_types').update(row).eq('id', leaveTypeId).select('id')
    : await database.from('leave_types').insert(row).select('id');

  if (error) return databaseFailure(error, 'A leave type with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr');
  return success(leaveTypeId ? 'Leave type saved.' : 'Leave type added.');
}

// Only a type nobody has asked for can be deleted; a used one is turned off instead, so
// past leave keeps its type.
export async function deleteLeaveTypeAction(leaveTypeId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.hrManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('leave_types').delete().eq('id', leaveTypeId).select('id');
  if (error) {
    if (isStillInUse(error)) return failure('Leave has already been taken or requested under this type. Untick Available to stop new requests instead.');
    return databaseFailure(error);
  }
  if (data.length === 0) return failure(noPermission);
  revalidatePath('/settings/hr');
  return success('Leave type deleted.');
}
