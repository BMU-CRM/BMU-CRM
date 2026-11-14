import 'server-only';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import type { leaveListSorts, leaveListStatuses } from '@/lib/validation/hrSchema';
import { createAdminDatabaseClient, createDatabaseClient } from '@/server/database/databaseClient';
import type { AttendanceReportData } from '@/lib/attendance/summariseAttendance';
import type { CurrentAccess } from './accessService';

export type HrDashboard = {
  total: number;
  active: number;
  newJoinings: number;
  onLeaveToday: number;
  presentToday: number;
  pendingLeave: number;
  servingNotice: number;
  departments: { name: string; count: number }[];
  attendanceTrend: { date: string; present: number }[];
  leaveByType: { name: string; days: number }[];
  anniversaries: { id: string; name: string; date: string; years: number }[];
};

// The HR dashboard's figures, worked out in the database in one call. Only people
// with the HR dashboard permission get them.
export async function getHrDashboard(from: string, to: string): Promise<HrDashboard> {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_hr_dashboard', { p_from: from, p_to: to });
  if (error) throw error;
  const raw = data as unknown as HrDashboard;
  return {
    ...raw,
    leaveByType: raw.leaveByType.map((row) => ({ ...row, days: Number(row.days) })),
  };
}

// Working hours and days. Every employee may read them and they rarely change, so they
// are kept for five minutes and shared between requests, and cleared the moment they are
// saved (companySettingsTag). The read uses no session, as cached work cannot read
// cookies; the pages that call this are all for signed-in people.
export const companySettingsTag = 'company-settings';

const readCompanySettings = unstable_cache(
  async () => {
    const { data, error } = await createAdminDatabaseClient()
      .from('company_settings')
      .select('work_start, work_end, late_grace_minutes, working_days, default_probation_months, overtime_after_minutes, half_day_minutes')
      .single();
    if (error) throw error;
    return data;
  },
  ['company-settings'],
  { revalidate: 300, tags: [companySettingsTag] },
);

export const getCompanySettings = cache(() => readCompanySettings());

export async function listHolidays(year: number) {
  return listHolidaysBetween(`${year}-01-01`, `${year}-12-31`);
}

export async function listHolidaysBetween(from: string, to: string, filters: { kind?: string; search?: string } = {}) {
  const database = await createDatabaseClient();
  let query = database
    .from('holidays')
    .select('id, holiday_date, name, kind, description')
    .gte('holiday_date', from)
    .lte('holiday_date', to)
    .order('holiday_date');
  if (filters.kind) query = query.eq('kind', filters.kind);
  const term = filters.search ? cleanSearchTerm(filters.search) : '';
  if (term) query = query.ilike('name', `%${term}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export type HolidayItem = Awaited<ReturnType<typeof listHolidaysBetween>>[number];

export async function getHoliday(holidayId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('holidays')
    .select('id, holiday_date, name, kind, description')
    .eq('id', holidayId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listLeaveTypes() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('leave_types')
    .select('id, name, yearly_allowance, is_paid, requires_attachment, is_active, carry_forward_cap, carry_forward_expiry_months, is_encashable')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

export const leaveRequestsPerPage = 25;

export type LeaveListFilters = {
  search?: string;
  status?: (typeof leaveListStatuses)[number];
  leaveTypeId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
  sort: (typeof leaveListSorts)[number];
  page: number;
};

// Every leave request HR can see, for the HR leave page. Row level security limits it
// to the requests the person may decide or oversee.
export async function listLeaveRequests({ search, status, leaveTypeId, departmentId, from, to, sort, page }: LeaveListFilters) {
  const database = await createDatabaseClient();
  const start = (page - 1) * leaveRequestsPerPage;

  let query = database
    .from('leave_requests')
    .select(
      `id, start_date, end_date, is_half_day, days, reason, status, decision_note, decided_at, created_at,
       employee_id, leave_type_id,
       employee:employees!leave_requests_employee_id_fkey!inner(id, full_name, department_id, department:departments!employees_department_id_fkey(name)),
       type:leave_types(name),
       decider:employees!leave_requests_decided_by_fkey(full_name),
       attachment:files(id, name)`,
      { count: 'exact' },
    )
    .range(start, start + leaveRequestsPerPage - 1);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.ilike('employee.full_name', `%${term}%`);
  if (status) query = query.eq('status', status);
  if (leaveTypeId) query = query.eq('leave_type_id', leaveTypeId);
  if (departmentId) query = query.eq('employee.department_id', departmentId);
  if (from) query = query.gte('end_date', from);
  if (to) query = query.lte('start_date', to);

  if (sort === 'start-asc') query = query.order('start_date');
  else if (sort === 'requested-desc') query = query.order('created_at', { ascending: false });
  else if (sort === 'days-desc') query = query.order('days', { ascending: false }).order('start_date', { ascending: false });
  else query = query.order('start_date', { ascending: false });

  const { data, count, error } = await query;
  if (error) throw error;
  return { requests: data, total: count ?? 0 };
}

export async function getLeaveUtilisation(year: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_leave_utilisation', { p_year: year });
  if (error) throw error;
  return data.map((row) => ({
    ...row,
    yearly_allowance: row.yearly_allowance === null ? null : Number(row.yearly_allowance),
    carried_forward: Number(row.carried_forward),
    approved: Number(row.approved),
    pending: Number(row.pending),
    remaining: row.remaining === null ? null : Number(row.remaining),
  }));
}

export async function getUpcomingBirthdays() {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_upcoming_birthdays');
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

// Whether the person's role records attendance. Off for roles such as the Founder's.
export async function tracksAttendance(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('employee_tracks_attendance', { p_employee: employeeId });
  if (error) throw error;
  return data !== false;
}

export async function getTodayAttendance(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('attendance_records')
    .select('check_in_at, check_out_at, work_mode, breaks:attendance_breaks(started_at, ended_at)')
    .eq('employee_id', access.employee.id)
    .eq('work_date', todayInIndia())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const finished = data.breaks.filter((entry) => entry.ended_at);
  return {
    check_in_at: data.check_in_at,
    check_out_at: data.check_out_at,
    work_mode: data.work_mode,
    breakMinutes: finished.reduce(
      (total, entry) => total + Math.round((new Date(entry.ended_at!).getTime() - new Date(entry.started_at).getTime()) / 60000),
      0,
    ),
    breakStartedAt: data.breaks.find((entry) => !entry.ended_at)?.started_at ?? null,
  };
}

export type TodayAttendance = Awaited<ReturnType<typeof getTodayAttendance>>;

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
    .select('id, work_date, check_in_at, check_out_at, source, note, work_mode, status_override, breaks:attendance_breaks(started_at, ended_at)')
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
    .is('employee_id', null)
    .is('candidate_id', null)
    .eq('status', 'ready')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}
