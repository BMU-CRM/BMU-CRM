// Turns raw attendance data into a monthly summary per person. Kept free of database
// code so the rules can be tested on their own.

export type AttendanceSettings = {
  work_start: string;
  work_end: string;
  late_grace_minutes: number;
  working_days: number[];
};

export type AttendanceReportData = {
  settings: AttendanceSettings;
  holidays: string[];
  employees: { id: string; name: string; department: string | null }[];
  records: { employee_id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; source: string }[];
  leave: { employee_id: string; start_date: string; end_date: string; is_half_day: boolean }[];
};

export type DayStatus = 'present' | 'late' | 'leave' | 'absent' | 'holiday' | 'off' | 'upcoming';

export type EmployeeAttendance = {
  employeeId: string;
  name: string;
  department: string | null;
  workingDays: number;
  present: number;
  late: number;
  earlyDepartures: number;
  leaveDays: number;
  absent: number;
  workedMinutes: number;
  days: Record<string, DayStatus>;
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

export function summariseAttendance(data: AttendanceReportData, from: string, to: string, today: string): EmployeeAttendance[] {
  const { settings } = data;
  const lateAfter = minutesOf(settings.work_start) + settings.late_grace_minutes;
  const leaveEnd = minutesOf(settings.work_end);
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
      late: 0,
      earlyDepartures: 0,
      leaveDays: 0,
      absent: 0,
      workedMinutes: 0,
      days: {},
    };

    for (const date of dates) {
      const isWorkingDay = settings.working_days.includes(isoWeekday(date)) && !holidays.has(date);
      const record = records.get(date);
      const onLeave = leave.find((entry) => entry.start_date <= date && entry.end_date >= date);

      if (record?.check_in_at && record.check_out_at) {
        summary.workedMinutes += Math.max(
          0,
          Math.round((new Date(record.check_out_at).getTime() - new Date(record.check_in_at).getTime()) / 60000),
        );
      }

      if (holidays.has(date)) {
        summary.days[date] = 'holiday';
        continue;
      }
      if (!isWorkingDay) {
        summary.days[date] = 'off';
        continue;
      }

      summary.workingDays += 1;

      if (record?.check_in_at) {
        const isLate = minutesOf(indiaClock(record.check_in_at)) > lateAfter;
        summary.present += 1;
        if (isLate) summary.late += 1;
        if (record.check_out_at && minutesOf(indiaClock(record.check_out_at)) < leaveEnd) summary.earlyDepartures += 1;
        // A half day of leave plus attendance counts as both.
        if (onLeave?.is_half_day) summary.leaveDays += 0.5;
        summary.days[date] = isLate ? 'late' : 'present';
      } else if (onLeave) {
        summary.leaveDays += onLeave.is_half_day ? 0.5 : 1;
        summary.days[date] = 'leave';
      } else if (date < today) {
        summary.absent += 1;
        summary.days[date] = 'absent';
      } else {
        summary.days[date] = 'upcoming';
      }
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
