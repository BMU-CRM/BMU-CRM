// Stage 12 of HR and Finance: the HR report figures and the notifications review
// (employee added, attendance missing a check-out).
import { beforeAll, describe, expect, it } from 'vitest';
import { summariseLeave, summarisePeople, type ReportPerson } from '@/lib/hr/hrReports';
import { createTestPeople } from './helpers/testDatabase';

const person = (id: string, joined: string | null, extra: Partial<ReportPerson> = {}): ReportPerson => ({
  id,
  employee_code: id.toUpperCase(),
  full_name: `Person ${id}`,
  employment_status: 'active',
  joining_date: joined,
  is_active: true,
  department: 'Design',
  designation: null,
  employment_type: 'Full time',
  ...extra,
});

describe('HR report figures', () => {
  const people = [
    person('a', '2025-01-10'),
    person('b', '2026-05-02', { department: 'Finance' }),
    person('c', '2026-07-20', { employment_type: null }),
    person('d', '2024-03-01', { employment_status: 'exited', is_active: false }),
    person('e', '2025-09-09', { employment_status: 'notice_period' }),
  ];
  const leavers = [
    { employee_id: 'd', last_working_day: '2026-06-30', reason: 'Moving city' },
    { employee_id: 'e', last_working_day: '2027-01-15', reason: null },
  ];
  const report = summarisePeople(people, leavers, { from: '2026-04-01', to: '2026-09-30' });

  it('counts current people by department, type and status', () => {
    expect(report.headcount).toBe(4);
    expect(report.byDepartment).toEqual([
      { name: 'Design', count: 3 },
      { name: 'Finance', count: 1 },
    ]);
    expect(report.byType).toEqual([
      { name: 'Full time', count: 3 },
      { name: 'Not set', count: 1 },
    ]);
    expect(report.byStatus.find((row) => row.name === 'notice_period')?.count).toBe(1);
  });

  it('lists joiners and leavers in the period, and the attrition rate', () => {
    expect(report.joiners.map((row) => row.id)).toEqual(['b', 'c']);
    expect(report.leavers.map((row) => row.employee_id)).toEqual(['d']);
    // On the books: a, d, e at the start (3); a, b, c, e at the end (4). One leaver over 3.5.
    expect([report.atStart, report.atEnd]).toEqual([3, 4]);
    expect(report.attritionRate).toBe(28.6);
  });

  it('totals leave by type, keeping types without a limit unlimited', () => {
    expect(
      summariseLeave([
        { leave_type: 'Casual', yearly_allowance: 12, carried_forward: 0, approved: 3, pending: 1 },
        { leave_type: 'Casual', yearly_allowance: 12, carried_forward: 2, approved: 5, pending: 0 },
        { leave_type: 'Unpaid', yearly_allowance: null, carried_forward: 0, approved: 1, pending: 0 },
      ]),
    ).toEqual([
      { leaveType: 'Casual', people: 2, allowance: 26, approved: 8, pending: 1 },
      { leaveType: 'Unpaid', people: 1, allowance: null, approved: 1, pending: 0 },
    ]);
  });
});

const runId = Date.now();

describe('the notifications review', () => {
  const people = createTestPeople(runId);
  const { admin, ids } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('manager', 'Employee', 'Design & Development', 'founder');
  });

  it('tells HR and the reporting manager when someone is added', async () => {
    await people.addPerson('newcomer', 'Employee', 'Design & Development', 'manager');
    const forPerson = async (key: string) =>
      (await admin.from('notifications').select('kind, link').eq('recipient_id', ids[key]!).eq('kind', 'employee_added')).data!.filter((row) => row.link === `/people/employees/${ids.newcomer}`);
    expect(await forPerson('hr')).toHaveLength(1);
    expect(await forPerson('manager')).toHaveLength(1);
    expect(await forPerson('newcomer')).toEqual([]);
  });

  it('reminds people who checked in yesterday but never checked out, and tells HR once', async () => {
    const yesterday = new Date(Date.now() + 5.5 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
    await admin.from('attendance_records').insert({ employee_id: ids.newcomer!, work_date: yesterday, check_in_at: `${yesterday}T04:00:00Z` });
    await admin.from('attendance_records').insert({ employee_id: ids.manager!, work_date: yesterday, check_in_at: `${yesterday}T04:00:00Z`, check_out_at: `${yesterday}T12:00:00Z` });

    const { data, error } = await admin.rpc('send_attendance_irregularities');
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);
    await admin.rpc('send_attendance_irregularities');

    const of = async (key: string) => (await admin.from('notifications').select('title').eq('recipient_id', ids[key]!).eq('kind', 'attendance_irregularity')).data!;
    expect(await of('newcomer')).toEqual([{ title: 'You did not check out yesterday' }]);
    expect(await of('manager')).toEqual([]);
    expect((await of('hr')).length).toBe(1);
  });
});
