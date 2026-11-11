// Turns raw attendance data into a monthly summary per person. Kept free of database
// code so the rules can be tested on their own.

export type AttendanceSettings = {
  work_start: string;
  work_end: string;
  late_grace_minutes: number;
  working_days: number[];
  // Empty until HR sets them.
  overtime_after_minutes?: number | null;
  half_day_minutes?: number | null;
};

// The statuses HR can set by hand on a day.
export const dayStatusOverrides = ['present', 'half_day', 'absent', 'leave', 'holiday', 'week_off'] as const;
export type DayStatusOverride = (typeof dayStatusOverrides)[number];

export type AttendanceRecord = {
  employee_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  source: string;
  work_mode?: 'office' | 'wfh';
  status_override?: DayStatusOverride | null;
  break_minutes?: number;
};

export type AttendanceReportData = {
  settings: AttendanceSettings;
  holidays: string[];
  employees: { id: string; name: string; department: string | null }[];
  records: AttendanceRecord[];
  leave: { employee_id: string; start_date: string; end_date: string; is_half_day: boolean }[];
};

export type DayStatus = DayStatusOverride | 'upcoming';

export const dayStatusLabels: Record<DayStatus, string> = {
  present: 'Present',
  half_day: 'Half day',
  absent: 'Absent',
  leave: 'Leave',
  holiday: 'Holiday',
  week_off: 'Week off',
  upcoming: 'Upcoming',
};

// One person's day, with everything the reports show.
export type AttendanceDay = {
  date: string;
  status: DayStatus;
  checkIn: string | null;
  checkOut: string | null;
  workMode: 'office' | 'wfh' | null;
  lateMinutes: number;
  earlyMinutes: number;
  breakMinutes: number;
  // Time between check-in and check-out, less breaks.
  workedMinutes: number;
  overtimeMinutes: number;
  isOverridden: boolean;
};

export type EmployeeAttendance = {
  employeeId: string;
  name: string;
  department: string | null;
  workingDays: number;
  // Days attended, including half days.
  present: number;
  halfDays: number;
  late: number;
  earlyDepartures: number;
  leaveDays: number;
  absent: number;
  wfhDays: number;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  days: Record<string, DayStatus>;
  details: AttendanceDay[];
};

const indiaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function indiaClock(timestamp: string) {
  return indiaTime.format(new Date(timestamp));
}

function minutesOf(clock: string) {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

// ISO weekday, where 1 is Monday and 7 is Sunday.
function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

// Works out one day: its status, lateness, early departure, breaks, hours and overtime.
// A status HR set by hand wins over the worked out one.
function describeDay(
  date: string,
  settings: AttendanceSettings,
  isHoliday: boolean,
  isWorkingDay: boolean,
  record: AttendanceRecord | undefined,
  onLeave: { is_half_day: boolean } | undefined,
  today: string,
): AttendanceDay {
  const start = minutesOf(settings.work_start);
  const lateAfter = start + settings.late_grace_minutes;
  const end = minutesOf(settings.work_end);

  const checkIn = record?.check_in_at ?? null;
  const checkOut = record?.check_out_at ?? null;
  const breakMinutes = record?.break_minutes ?? 0;
  const workedMinutes = checkIn && checkOut ? Math.max(0, minutesBetween(checkIn, checkOut) - breakMinutes) : 0;
  const inClock = checkIn ? minutesOf(indiaClock(checkIn)) : null;
  const outClock = checkOut ? minutesOf(indiaClock(checkOut)) : null;
  const overtimeAfter = settings.overtime_after_minutes ?? null;

  let status: DayStatus;
  if (isHoliday) status = 'holiday';
  else if (!isWorkingDay) status = 'week_off';
  else if (checkIn) {
    const shortDay = settings.half_day_minutes != null && checkOut !== null && workedMinutes < settings.half_day_minutes;
    status = onLeave?.is_half_day || shortDay ? 'half_day' : 'present';
  } else if (onLeave) status = 'leave';
  else status = date < today ? 'absent' : 'upcoming';

  const override = record?.status_override ?? null;

  return {
    date,
    status: override ?? status,
    checkIn,
    checkOut,
    workMode: checkIn ? (record?.work_mode ?? 'office') : null,
    // Lateness is counted only past the grace period, but measured from the start time.
    lateMinutes: inClock !== null && isWorkingDay && !isHoliday && inClock > lateAfter ? inClock - start : 0,
    earlyMinutes: outClock !== null && isWorkingDay && !isHoliday && outClock < end ? end - outClock : 0,
    breakMinutes,
    workedMinutes,
    overtimeMinutes: overtimeAfter !== null && workedMinutes > overtimeAfter ? workedMinutes - overtimeAfter : 0,
    isOverridden: override !== null,
  };
}

export function summariseAttendance(data: AttendanceReportData, from: string, to: string, today: string): EmployeeAttendance[] {
  const { settings } = data;
  const holidays = new Set(data.holidays);
  const dates = datesBetween(from, to);

  return data.employees.map((employee) => {
    const records = new Map(
      data.records.filter((record) => record.employee_id === employee.id).map((record) => [record.work_date, record]),
    );
    const leave = data.leave.filter((entry) => entry.employee_id === employee.id);

    const summary: EmployeeAttendance = {
      employeeId: employee.id,
      name: employee.name,
      department: employee.department,
      workingDays: 0,
      present: 0,
      halfDays: 0,
      late: 0,
      earlyDepartures: 0,
      leaveDays: 0,
      absent: 0,
      wfhDays: 0,
      workedMinutes: 0,
      breakMinutes: 0,
      overtimeMinutes: 0,
      days: {},
      details: [],
    };

    for (const date of dates) {
      const isHoliday = holidays.has(date);
      const isWorkingDay = settings.working_days.includes(isoWeekday(date)) && !isHoliday;
      const record = records.get(date);
      const onLeave = leave.find((entry) => entry.start_date <= date && entry.end_date >= date);
      const day = describeDay(date, settings, isHoliday, isWorkingDay, record, onLeave, today);

      summary.days[date] = day.status;
      summary.details.push(day);
      summary.workedMinutes += day.workedMinutes;
      summary.breakMinutes += day.breakMinutes;
      summary.overtimeMinutes += day.overtimeMinutes;
      if (day.workMode === 'wfh') summary.wfhDays += 1;
      if (day.lateMinutes > 0) summary.late += 1;
      if (day.earlyMinutes > 0) summary.earlyDepartures += 1;
      if (isWorkingDay) summary.workingDays += 1;

      if (day.status === 'present') summary.present += 1;
      else if (day.status === 'half_day') {
        summary.present += 1;
        summary.halfDays += 1;
        // A half day of leave plus attendance counts as both.
        if (onLeave?.is_half_day) summary.leaveDays += 0.5;
      } else if (day.status === 'leave') summary.leaveDays += onLeave?.is_half_day ? 0.5 : 1;
      else if (day.status === 'absent') summary.absent += 1;
    }

    return summary;
  });
}

export function formatWorkedTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest.toString().padStart(2, '0')}m`;
}

// Reads a CSV with the columns employee, date, check_in and check_out. The first line
// is the header. Employee can be a work email or an employee ID.
export function parseAttendanceCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], error: 'The file is empty.' };

  const header = lines[0]!.toLowerCase().split(',').map((cell) => cell.trim());
  const column = (name: string) => header.indexOf(name);
  const employeeColumn = column('employee');
  const dateColumn = column('date');
  if (employeeColumn === -1 || dateColumn === -1) {
    return { rows: [], error: 'The first line must name the columns: employee, date, check_in, check_out.' };
  }

  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return {
      employee: cells[employeeColumn] ?? '',
      date: cells[dateColumn] ?? '',
      check_in: cells[column('check_in')] ?? '',
      check_out: cells[column('check_out')] ?? '',
    };
  });

  return { rows, error: null };
}
