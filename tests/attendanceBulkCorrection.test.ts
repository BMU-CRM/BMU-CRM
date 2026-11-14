// Correcting attendance for several people and days at once.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

// 1 March 2027 is a Monday. Wednesday 3 March is made a holiday; Saturday and Sunday are week offs.
const monday = '2027-03-01';
const sunday = '2027-03-07';

describe('correcting attendance for several people', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  async function records(employeeId: string) {
    const { data } = await admin
      .from('attendance_records')
      .select('work_date, check_in_at, check_out_at, work_mode, status_override, source, note')
      .eq('employee_id', employeeId)
      .gte('work_date', monday)
      .lte('work_date', sunday)
      .order('work_date');
    return data ?? [];
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'founder');

    await admin.from('company_settings').update({ working_days: [1, 2, 3, 4, 5] }).not('id', 'is', null);
    await admin.from('holidays').insert({ holiday_date: '2027-03-03', name: `Outage holiday ${runId}` });
    const leaveType = (await admin.from('leave_types').select('id').limit(1).single()).data!.id;
    const leave = await admin
      .from('leave_requests')
      .insert({ employee_id: ids.designer!, leave_type_id: leaveType, start_date: '2027-03-04', end_date: '2027-03-04', reason: 'Wedding' })
      .select('id')
      .single();
    expect(leave.error).toBeNull();
    const approved = await as.founder!.from('leave_requests').update({ status: 'approved' }).eq('id', leave.data!.id).select('status');
    expect(approved.data).toEqual([{ status: 'approved' }]);
  });

  it('corrects every chosen person and day, skipping leave, holidays and week offs', async () => {
    const { data, error } = await as.hr!.rpc('correct_attendance_bulk', {
      p_employees: [ids.designer!, ids.colleague!],
      p_from: monday,
      p_to: sunday,
      p_check_in: '09:00',
      p_check_out: '18:00',
      p_work_mode: 'wfh',
      p_note: 'Office internet outage',
    });

    expect(error).toBeNull();
    // Designer: Mon, Tue, Fri (Thu on leave). Colleague: Mon, Tue, Thu, Fri.
    expect(data).toEqual({ changed: 7, on_leave: 1, days_off: 6, people: 2 });

    const designer = await records(ids.designer!);
    expect(designer.map((row) => row.work_date)).toEqual(['2027-03-01', '2027-03-02', '2027-03-05']);
    expect(designer.every((row) => row.source === 'manual' && row.work_mode === 'wfh' && row.note === 'Office internet outage')).toBe(true);
    expect(new Date(designer[0]!.check_in_at!).toISOString()).toBe('2027-03-01T03:30:00.000Z');
    expect(await records(ids.colleague!)).toHaveLength(4);
  });

  it('writes one audit entry listing the people and days', async () => {
    const { data } = await admin.from('audit_logs').select('action, details').eq('entity_type', 'attendance_records').eq('action', 'corrected');
    expect(data).toHaveLength(1);
    const details = data![0]!.details as { days: unknown[]; note: string; label: string };
    expect(details.days).toHaveLength(7);
    expect(details.note).toBe('Office internet outage');
    expect(details.label).toBe('for 2 people, 01 Mar 2027 to 07 Mar 2027');
  });

  it('changes only what was filled in', async () => {
    const { error } = await as.hr!.rpc('correct_attendance_bulk', {
      p_employees: [ids.colleague!],
      p_from: monday,
      p_to: monday,
      p_status: 'half_day',
      p_note: 'Left at lunch',
    });
    expect(error).toBeNull();

    const [day] = await records(ids.colleague!);
    expect(day).toMatchObject({ work_mode: 'wfh', status_override: 'half_day', note: 'Left at lunch' });
    expect(new Date(day!.check_out_at!).toISOString()).toBe('2027-03-01T12:30:00.000Z');

    // "Work it out from the times" clears the status again.
    await as.hr!.rpc('correct_attendance_bulk', { p_employees: [ids.colleague!], p_from: monday, p_to: monday, p_status: 'auto', p_note: 'Undo' });
    expect((await records(ids.colleague!))[0]!.status_override).toBeNull();
  });

  it('refuses a time that would put check-out before check-in', async () => {
    const { error } = await as.hr!.rpc('correct_attendance_bulk', {
      p_employees: [ids.colleague!],
      p_from: monday,
      p_to: monday,
      p_check_in: '19:00',
      p_note: 'Typo',
    });
    expect(error?.message).toContain('check-out would be before check-in');
  });

  it('keeps the same rules as a single correction', async () => {
    const own = await as.hr!.rpc('correct_attendance_bulk', { p_employees: [ids.hr!, ids.designer!], p_from: monday, p_to: monday, p_status: 'present', p_note: 'x' });
    const notAllowed = await as.designer!.rpc('correct_attendance_bulk', { p_employees: [ids.colleague!], p_from: monday, p_to: monday, p_status: 'present', p_note: 'x' });
    const nothing = await as.hr!.rpc('correct_attendance_bulk', { p_employees: [ids.designer!], p_from: monday, p_to: monday, p_note: 'x' });
    const noReason = await as.hr!.rpc('correct_attendance_bulk', { p_employees: [ids.designer!], p_from: monday, p_to: monday, p_status: 'present', p_note: '  ' });
    const tooLong = await as.hr!.rpc('correct_attendance_bulk', { p_employees: [ids.designer!], p_from: '2027-01-01', p_to: '2027-03-01', p_status: 'present', p_note: 'x' });

    expect(own.error?.message).toContain('your own attendance');
    expect(notAllowed.error?.code).toBe('42501');
    expect(nothing.error?.message).toContain('at least one thing');
    expect(noReason.error?.message).toContain('reason');
    expect(tooLong.error?.message).toContain('31 days');
    // Nothing from the refused calls was saved.
    expect((await records(ids.designer!)).every((row) => row.status_override === null)).toBe(true);
  });
});
