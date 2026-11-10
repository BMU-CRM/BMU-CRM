import 'server-only';
import { todayInIndia } from '@/lib/formatDate';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { AttendanceReportData } from '@/lib/attendance/summariseAttendance';
import type { CurrentAccess } from './accessService';

export async function getCompanySettings() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('company_settings').select('work_start, work_end, late_grace_minutes, working_days').single();
  if (error) throw error;
  return data;
}

export async function listHolidays(year: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('holidays')
    .select('id, holiday_date, name')
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
    .order('holiday_date');
  if (error) throw error;
  return data;
}

export async function listLeaveTypes() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_types')
    .select('id, name, yearly_allowance, is_paid, requires_attachment, is_active')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

// Your own balances by default. Approvers can also see the people whose leave they decide.
export async function getLeaveBalances(employeeId?: string, year?: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_leave_balances', {
    ...(employeeId ? { p_employee: employeeId } : {}),
    ...(year ? { p_year: year } : {}),
  });
  if (error) throw error;
  return data;
}

const leaveFields = `
  id, start_date, end_date, is_half_day, days, reason, status, decision_note, decided_at, created_at,
  employee_id, approver_id,
  employee:employees!leave_requests_employee_id_fkey(id, full_name, department:departments!employees_department_id_fkey(name)),
  type:leave_types(name),
  decider:employees!leave_requests_decided_by_fkey(full_name),
  attachment:files(id, name)
`;

export async function listMyLeave(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_requests')
    .select(leaveFields)
    .eq('employee_id', access.employee.id)
    .order('start_date', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export type LeaveRequestItem = Awaited<ReturnType<typeof listMyLeave>>[number];

// Row level security returns only requests this person may decide, besides their own.
export async function listLeaveAwaitingDecision(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_requests')
    .select(leaveFields)
    .eq('status', 'pending')
    .neq('employee_id', access.employee.id)
    .order('start_date');
  if (error) throw error;
  return data;
}

export async function getTeamLeave(from: string, to: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_team_leave', { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

export async function getTodayAttendance(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('attendance_records')
    .select('check_in_at, check_out_at')
    .eq('employee_id', access.employee.id)
    .eq('work_date', todayInIndia())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAttendanceReportData(from: string, to: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_attendance_report_data', { p_from: from, p_to: to });
  if (error) throw error;
  return data as AttendanceReportData | null;
}

export async function listAttendanceRecords(employeeId: string, from: string, to: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('attendance_records')
    .select('id, work_date, check_in_at, check_out_at, source, note')
    .eq('employee_id', employeeId)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMyRecentFiles(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .select('id, name')
    .eq('owner_id', access.employee.id)
    .eq('status', 'ready')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}
