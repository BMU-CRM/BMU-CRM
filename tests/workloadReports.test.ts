// Workload reports: HR and Client Managers see everyone's workload, look at a day or a
// week, and send it to the Founder, who finds it on Received reports.
import { beforeAll, describe, expect, it } from 'vitest';
import { chooseWorkloadPeriod, workloadFileName, workloadPeriodLabel } from '@/lib/workload/workloadPeriod';
import { toWorkloadActivity, workloadCsv, workloadTotals } from '@/lib/workload/workloadReport';
import { createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('workload report periods', () => {
  it('runs a week from Monday to Sunday', () => {
    // 18 Nov 2026 is a Wednesday.
    const week = chooseWorkloadPeriod({ period: 'week', date: '2026-11-18' }, '2026-11-30');
    expect(week).toMatchObject({ kind: 'week', from: '2026-11-16', to: '2026-11-22', previous: '2026-11-09', next: '2026-11-23' });
    expect(workloadPeriodLabel(week)).toBe('16 Nov – 22 Nov 2026');
    expect(workloadFileName(week)).toBe('workload-week-2026-11-16.csv');
    expect(chooseWorkloadPeriod({ period: 'week', date: '2026-11-22' }, '2026-11-30').from).toBe('2026-11-16');
    expect(chooseWorkloadPeriod({ period: 'week', date: '2026-11-16' }, '2026-11-30').from).toBe('2026-11-16');
  });

  it('uses today for a missing, wrong or future date, and offers no next period past today', () => {
    expect(chooseWorkloadPeriod({}, '2026-11-18')).toMatchObject({ kind: 'day', from: '2026-11-18', to: '2026-11-18', next: null, previous: '2026-11-17' });
    expect(chooseWorkloadPeriod({ date: '2026-02-30' }, '2026-11-18').date).toBe('2026-11-18');
    expect(chooseWorkloadPeriod({ date: '2027-01-01' }, '2026-11-18').date).toBe('2026-11-18');
    expect(chooseWorkloadPeriod({ period: 'week', date: '2026-11-18' }, '2026-11-18').next).toBeNull();
  });
});

describe('workload report figures', () => {
  const rows = [
    toWorkloadActivity({ employee_id: 'a', full_name: 'Asha', department_name: 'Design', assigned: 2, started: 1, submitted: '1', hours_worked: '3.5' }),
    toWorkloadActivity({ employee_id: 'b', full_name: '=Bad name', department_name: null, assigned: 1, hours_worked: 1.25, overdue: 2 }),
  ];

  it('adds up the totals', () => {
    expect(workloadTotals(rows)).toMatchObject({ assigned: 3, started: 1, submitted: 1, hours_worked: 4.75, overdue: 2 });
  });

  it('writes a CSV with a total line, safe from spreadsheet formulas', () => {
    const { header, rows: lines } = workloadCsv(rows);
    expect(header.slice(0, 4)).toEqual(['Employee', 'Department', 'Designation', 'Assigned']);
    expect(lines[1]![0]).toBe("'=Bad name");
    expect(lines[1]![1]).toBe('No department');
    expect(lines.at(-1)!.slice(0, 4)).toEqual(['Total', '2 people', '', '3']);
    expect(lines.at(-1)![header.indexOf('Hours worked')]).toBe('4.75');
  });
});

describe('workload reports in the database', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', await people.departmentId('Design & Development'));
  });

  const activity = async (who: Client, from = today, to = today) => {
    const { data, error } = await who.rpc('get_workload_activity', { p_from: from, p_to: to });
    expect(error).toBeNull();
    return data!;
  };

  it('lets HR and Client Managers see every employee', async () => {
    for (const who of [as.hr!, as.manager!]) {
      const rows = await activity(who);
      expect(rows.some((row) => row.employee_id === ids.designer)).toBe(true);
    }
    // An employee without workload access sees nobody.
    expect(await activity(as.designer!)).toEqual([]);
  });

  it('counts what happened in the day and where work stood at its end', async () => {
    const { data: task } = await as.designHead!.from('tasks').insert({ title: `Report ${runId}`, assignee_id: ids.designer!, due_date: '2020-01-01' }).select('id').single();
    const move = (who: Client, status: string) => who.from('tasks').update({ status: status as never }).eq('id', task!.id).select('id');
    for (const status of ['accepted', 'in_progress', 'under_review']) expect((await move(as.designer!, status)).error).toBeNull();
    expect((await move(as.designHead!, 'changes_requested')).error).toBeNull();
    for (const status of ['in_progress', 'under_review']) await move(as.designer!, status);

    const row = (await activity(as.hr!)).find((entry) => entry.employee_id === ids.designer)!;
    expect(row).toMatchObject({ assigned: 1, started: 1, submitted: 2, sent_back: 1, approved: 0, waiting_review: 1, overdue: 1 });

    expect((await move(as.designHead!, 'completed')).error).toBeNull();
    const after = (await activity(as.hr!)).find((entry) => entry.employee_id === ids.designer)!;
    expect(after).toMatchObject({ approved: 1, completed_late: 1, waiting_review: 0, overdue: 0 });

    // Each stretch of work was recorded for the person doing it.
    const { data: sessions } = await admin.from('task_work_sessions').select('employee_id').eq('task_id', task!.id);
    expect(sessions!.length).toBe(2);
    expect(sessions!.every((session) => session.employee_id === ids.designer)).toBe(true);
  });

  it('splits hours across days at midnight, India time', async () => {
    const { data: task } = await as.designHead!.from('tasks').insert({ title: `Hours ${runId}`, assignee_id: ids.designer! }).select('id').single();
    // 23:00 on 1 Nov to 01:30 on 2 Nov 2026, India time.
    await admin.from('task_work_sessions').insert({
      task_id: task!.id,
      employee_id: ids.designer!,
      started_at: '2026-11-01T17:30:00Z',
      ended_at: '2026-11-01T20:00:00Z',
    });
    const hours = async (day: string) => Number((await activity(as.hr!, day, day)).find((entry) => entry.employee_id === ids.designer)!.hours_worked);
    expect(await hours('2026-11-01')).toBe(1);
    expect(await hours('2026-11-02')).toBe(1.5);
    expect(Number((await activity(as.hr!, '2026-10-26', '2026-11-01')).find((entry) => entry.employee_id === ids.designer)!.hours_worked)).toBe(1);
  });

  it('sends a report to the Founder, who alone receives it', async () => {
    const { data: id, error } = await as.manager!.rpc('send_workload_report', { p_period: 'week', p_date: today, p_note: 'Busy week' });
    expect(error).toBeNull();

    const { data: report } = await as.founder!.from('workload_reports').select('period, period_from, period_to, title, note, figures, sent_by').eq('id', id!).single();
    expect(report).toMatchObject({ period: 'week', note: 'Busy week', sent_by: ids.manager });
    expect(report!.title).toMatch(/^Workload report, week of /);
    const from = new Date(`${report!.period_from}T00:00:00Z`);
    expect(from.getUTCDay()).toBe(1);
    expect((report!.figures as { employee_id: string }[]).some((row) => row.employee_id === ids.designer)).toBe(true);

    const { data: notices } = await admin.from('notifications').select('kind, link').eq('recipient_id', ids.founder!).eq('kind', 'workload_report_received');
    expect(notices!.some((notice) => notice.link === `/workload/reports/${id}`)).toBe(true);

    // The sender sees their own; nobody else does.
    expect((await as.manager!.from('workload_reports').select('id').eq('id', id!)).data).toHaveLength(1);
    expect((await as.hr!.from('workload_reports').select('id').eq('id', id!)).data).toEqual([]);
    expect((await as.designer!.from('workload_reports').select('id').eq('id', id!)).data).toEqual([]);
  });

  it('lets only those allowed send, for a day that has started', async () => {
    const refused = await as.designer!.rpc('send_workload_report', { p_period: 'day', p_date: today });
    expect(refused.error?.message).toContain('cannot send');
    const future = await as.hr!.rpc('send_workload_report', { p_period: 'day', p_date: '2999-01-01' });
    expect(future.error?.message).toContain('already started');
    const sent = await as.hr!.rpc('send_workload_report', { p_period: 'day', p_date: today });
    expect(sent.error).toBeNull();
    // A report cannot be written directly or changed.
    const direct = await as.hr!.from('workload_reports').insert({ period: 'day', period_from: today, period_to: today, title: 'x', sent_by_name: 'x' } as never).select('id');
    expect(direct.data ?? []).toHaveLength(0);
    expect((await as.hr!.from('task_work_sessions' as never).select('id')).data ?? []).toEqual([]);
  });
});
