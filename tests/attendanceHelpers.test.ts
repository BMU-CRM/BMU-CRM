import { describe, expect, it } from 'vitest';
import {
  datesBetween,
  formatWorkedTime,
  indiaClock,
  parseAttendanceCsv,
  summariseAttendance,
  type AttendanceReportData,
} from '@/lib/attendance/summariseAttendance';

const settings = { work_start: '09:30:00', work_end: '18:30:00', late_grace_minutes: 15, working_days: [1, 2, 3, 4, 5] };

// 4 to 10 January 2027: Monday to Sunday. India is UTC+5:30.
function data(overrides: Partial<AttendanceReportData> = {}): AttendanceReportData {
  return {
    settings,
    holidays: [],
    employees: [{ id: 'a', name: 'Asha', department: 'Design' }],
    records: [],
    leave: [],
    ...overrides,
  };
}

const record = (date: string, checkIn: string, checkOut: string | null) => ({
  employee_id: 'a',
  work_date: date,
  check_in_at: `${date}T${checkIn}:00+05:30`,
  check_out_at: checkOut ? `${date}T${checkOut}:00+05:30` : null,
  source: 'web',
});

describe('summariseAttendance', () => {
  it('counts working days and skips the weekend', () => {
    const [person] = summariseAttendance(data(), '2027-01-04', '2027-01-10', '2027-01-11');

    expect(person?.workingDays).toBe(5);
    expect(person?.days['2027-01-09']).toBe('week_off');
  });

  it('marks someone late only after the grace period', () => {
    const [person] = summariseAttendance(
      data({ records: [record('2027-01-04', '09:45', '18:30'), record('2027-01-05', '09:46', '18:30')] }),
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
    );

    expect(person?.days).toEqual({ '2027-01-04': 'present', '2027-01-05': 'present' });
    expect(person?.details.map((day) => day.lateMinutes)).toEqual([0, 16]);
    expect(person?.late).toBe(1);
    expect(person?.present).toBe(2);
  });

  it('counts early departures and hours worked', () => {
    const [person] = summariseAttendance(data({ records: [record('2027-01-04', '09:30', '17:00')] }), '2027-01-04', '2027-01-04', '2027-01-05');

    expect(person?.earlyDepartures).toBe(1);
    expect(person?.workedMinutes).toBe(450);
  });

  it('counts leave and holidays instead of absence', () => {
    const [person] = summariseAttendance(
      data({
        holidays: ['2027-01-06'],
        leave: [{ employee_id: 'a', start_date: '2027-01-04', end_date: '2027-01-05', is_half_day: false }],
      }),
      '2027-01-04',
      '2027-01-08',
      '2027-01-11',
    );

    expect(person).toMatchObject({ workingDays: 4, leaveDays: 2, absent: 2 });
    expect(person?.days['2027-01-06']).toBe('holiday');
  });

  it('does not count future days as absent', () => {
    const [person] = summariseAttendance(data(), '2027-01-04', '2027-01-08', '2027-01-06');

    expect(person?.absent).toBe(2);
    expect(person?.days['2027-01-07']).toBe('upcoming');
  });

  it('counts a half day of leave alongside attendance', () => {
    const [person] = summariseAttendance(
      data({
        records: [record('2027-01-04', '13:30', '18:30')],
        leave: [{ employee_id: 'a', start_date: '2027-01-04', end_date: '2027-01-04', is_half_day: true }],
      }),
      '2027-01-04',
      '2027-01-04',
      '2027-01-05',
    );

    expect(person).toMatchObject({ present: 1, halfDays: 1, leaveDays: 0.5 });
    expect(person?.days['2027-01-04']).toBe('half_day');
  });

  it('takes breaks off the hours worked and counts overtime only once HR sets it', () => {
    const long = { ...record('2027-01-04', '09:00', '20:00'), break_minutes: 60 };
    const [withoutRule] = summariseAttendance(data({ records: [long] }), '2027-01-04', '2027-01-04', '2027-01-05');
    expect(withoutRule).toMatchObject({ workedMinutes: 600, breakMinutes: 60, overtimeMinutes: 0 });

    const [withRule] = summariseAttendance(
      data({ settings: { ...settings, overtime_after_minutes: 540 }, records: [long] }),
      '2027-01-04',
      '2027-01-04',
      '2027-01-05',
    );
    expect(withRule?.overtimeMinutes).toBe(60);
  });

  it('marks a short day as a half day once HR sets the threshold', () => {
    const short = record('2027-01-04', '09:30', '13:00');
    const [person] = summariseAttendance(
      data({ settings: { ...settings, half_day_minutes: 240 }, records: [short] }),
      '2027-01-04',
      '2027-01-04',
      '2027-01-05',
    );
    expect(person?.days['2027-01-04']).toBe('half_day');
    expect(person?.details[0]?.earlyMinutes).toBe(330);
  });

  it('counts days worked from home and uses the status HR set', () => {
    const [person] = summariseAttendance(
      data({
        records: [
          { ...record('2027-01-04', '09:30', '18:30'), work_mode: 'wfh' },
          { ...record('2027-01-05', '09:30', '18:30'), status_override: 'absent' },
        ],
      }),
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
    );
    expect(person).toMatchObject({ wfhDays: 1, present: 1, absent: 1 });
    expect(person?.details[1]?.isOverridden).toBe(true);
  });
});

describe('helpers', () => {
  it('shows times in Indian time', () => {
    expect(indiaClock('2027-01-04T04:00:00Z')).toBe('09:30');
  });

  it('formats worked time', () => {
    expect(formatWorkedTime(485)).toBe('8h 05m');
  });

  it('lists every date in a range', () => {
    expect(datesBetween('2027-02-27', '2027-03-02')).toEqual(['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02']);
  });

  it('reads a CSV in any column order', () => {
    const { rows, error } = parseAttendanceCsv('date,employee,check_out,check_in\n2027-01-04,EMP-0001,18:30,09:30\n');

    expect(error).toBeNull();
    expect(rows).toEqual([{ employee: 'EMP-0001', date: '2027-01-04', check_in: '09:30', check_out: '18:30' }]);
  });

  it('explains a CSV without the right columns', () => {
    expect(parseAttendanceCsv('name,day\nx,y').error).toContain('employee, date');
  });
});
