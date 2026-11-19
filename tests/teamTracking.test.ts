// Team tracking for the Founder: red flags with "looked into" comments and editable
// limits, Reviewed with a reply, daily report reminders for Client Managers, the team
// pulse card's permission; and sub services that ask for no plan on clients.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDashboard } from '@/lib/access/dashboardWidgetRegistry';
import { sortFlags, toWorkloadFlag } from '@/lib/workload/workloadFlags';
import { createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const daysAgo = (days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

describe('red flag helpers', () => {
  it('lists open flags before those looked into', () => {
    const flags = [
      toWorkloadFlag({ flag_key: 'a', kind: 'overdue', detail: 'x', note: 'done' }),
      toWorkloadFlag({ flag_key: 'b', kind: 'idle', detail: 'y' }),
    ];
    expect(sortFlags(flags).map((flag) => flag.flag_key)).toEqual(['b', 'a']);
  });

  it('shows the team pulse to those allowed', () => {
    expect(buildDashboard({ 'dashboard.team_pulse': 'organisation' }).map((widget) => widget.key)[0]).toBe('teamPulse');
    expect(buildDashboard({ 'hr.dashboard': 'organisation' }).map((widget) => widget.key)).not.toContain('teamPulse');
  });
});

describe('team tracking in the database', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', await people.departmentId('Design & Development'));
  });

  const flagsFor = async (who: Client) => {
    const { data, error } = await who.rpc('get_workload_flags');
    expect(error).toBeNull();
    return data!;
  };
  const newTask = async (title: string, values: Record<string, unknown> = {}) => {
    const { data, error } = await as.designHead!.from('tasks').insert({ title: `${title} ${runId}`, assignee_id: ids.designer!, ...values }).select('id').single();
    expect(error).toBeNull();
    return data!.id;
  };
  const move = (who: Client, id: string, status: string) => who.from('tasks').update({ status: status as never }).eq('id', id).select('id');

  it('gives the permissions to the right roles', async () => {
    const { data } = await admin
      .from('role_permissions')
      .select('permission_key, role:roles(name)')
      .in('permission_key', ['dashboard.team_pulse', 'workload.daily_report', 'workload.flags_manage']);
    const pairs = (data ?? []).map((row) => `${(row.role as { name: string } | null)?.name}:${row.permission_key}`).sort();
    expect(pairs).toEqual([
      'Client Manager:dashboard.team_pulse',
      'Client Manager:workload.daily_report',
      'Founder:dashboard.team_pulse',
      'Founder:workload.flags_manage',
      'Human Resource:workload.flags_manage',
    ]);
  });

  it('flags work overdue by more than the limit, and lets HR mark it looked into', async () => {
    const late = await newTask('Late', { due_date: daysAgo(10) });
    const slightlyLate = await newTask('Slightly late', { due_date: daysAgo(1) });
    const flags = await flagsFor(as.hr!);
    const flag = flags.find((entry) => entry.task_id === late && entry.kind === 'overdue');
    expect(flag?.detail).toContain('10 days overdue');
    expect(flags.some((entry) => entry.task_id === slightlyLate && entry.kind === 'overdue')).toBe(false);

    expect((await as.designer!.rpc('set_workload_flag_note', { p_flag_key: flag!.flag_key, p_note: 'Done' })).error?.message).toContain('cannot');
    expect((await as.hr!.rpc('set_workload_flag_note', { p_flag_key: flag!.flag_key, p_note: 'Spoke to them, new date Friday' })).error).toBeNull();
    const noted = (await flagsFor(as.founder!)).find((entry) => entry.flag_key === flag!.flag_key);
    expect(noted).toMatchObject({ note: 'Spoke to them, new date Friday' });
    expect(noted!.noted_by_name).toContain('hr');

    expect((await as.hr!.rpc('set_workload_flag_note', { p_flag_key: flag!.flag_key, p_note: '' })).error).toBeNull();
    expect((await flagsFor(as.hr!)).find((entry) => entry.flag_key === flag!.flag_key)?.note).toBeNull();
  });

  it('flags work sent back again and again, and work waiting long for review', async () => {
    const id = await newTask('Rework');
    for (const status of ['accepted', 'in_progress', 'under_review']) await move(as.designer!, id, status);
    for (let round = 0; round < 3; round += 1) {
      await move(as.designHead!, id, 'changes_requested');
      await move(as.designer!, id, 'in_progress');
      await move(as.designer!, id, 'under_review');
    }
    const flags = await flagsFor(as.manager!);
    expect(flags.find((entry) => entry.task_id === id && entry.kind === 'rework')?.detail).toBe('Sent back for rework 3 times');

    await admin.from('tasks').update({ submitted_at: new Date(Date.now() - 5 * 86_400_000).toISOString() }).eq('id', id);
    const review = (await flagsFor(as.manager!)).find((entry) => entry.task_id === id && entry.kind === 'review');
    expect(review?.employee_id).toBe(ids.designHead);
    expect(review?.detail).toMatch(/Waiting for review for [5-6] days/);
  });

  it('flags someone with nothing done for some working days', async () => {
    await people.addPerson('quiet', 'Employee', 'Design & Development', 'designHead');
    const { data: task } = await as.designHead!.from('tasks').insert({ title: `Untouched ${runId}`, assignee_id: ids.quiet! }).select('id').single();
    // Given to them 12 days ago, and nothing done since.
    await admin.from('tasks').update({ created_at: new Date(Date.now() - 12 * 86_400_000).toISOString() }).eq('id', task!.id);
    const idle = (await flagsFor(as.hr!)).find((entry) => entry.employee_id === ids.quiet && entry.kind === 'idle');
    expect(idle?.detail).toMatch(/No task activity for \d+ working days/);
    // The designer worked today, so is not idle.
    expect((await flagsFor(as.hr!)).some((entry) => entry.employee_id === ids.designer && entry.kind === 'idle')).toBe(false);
  });

  it('flags attendance that does not match the hours on tasks', async () => {
    await admin.from('workload_flag_settings').update({ hours_tracked_from: '2000-01-01' }).eq('id', true);
    for (let back = 1; back <= 7; back += 1) {
      await admin.from('attendance_records').upsert(
        { employee_id: ids.designer!, work_date: daysAgo(back), check_in_at: `${daysAgo(back)}T04:00:00Z` },
        { onConflict: 'employee_id,work_date' },
      );
    }
    const flag = (await flagsFor(as.hr!)).find((entry) => entry.employee_id === ids.designer && entry.kind === 'attendance');
    expect(flag?.detail).toMatch(/Checked in on .* but logged no hours on tasks/);

    // Turned off in the limits, it is not checked.
    expect((await as.manager!.from('workload_flag_settings').update({ check_attendance: false }).eq('id', true).select('id')).data ?? []).toHaveLength(0);
    expect((await as.hr!.from('workload_flag_settings').update({ check_attendance: false }).eq('id', true).select('id')).data).toHaveLength(1);
    expect((await flagsFor(as.hr!)).some((entry) => entry.kind === 'attendance')).toBe(false);
    await admin.from('workload_flag_settings').update({ check_attendance: true, hours_tracked_from: today }).eq('id', true);
  });

  it('keeps open flags in a sent report, and lets the Founder mark it reviewed with a reply', async () => {
    const { data: reportId, error } = await as.manager!.rpc('send_workload_report', { p_period: 'day', p_date: today });
    expect(error).toBeNull();
    const { data: report } = await as.founder!.from('workload_reports').select('flags').eq('id', reportId!).single();
    expect((report!.flags as unknown[]).length).toBeGreaterThan(0);

    expect((await as.manager!.rpc('review_workload_report', { p_report: reportId!, p_reply: 'x' })).error?.message).toContain('cannot review');
    expect((await as.founder!.rpc('review_workload_report', { p_report: reportId!, p_reply: 'Thanks, follow up on the late ones' })).error).toBeNull();
    const { data: reviewed } = await as.manager!.from('workload_reports').select('reviewed_at, reviewed_by, reply').eq('id', reportId!).single();
    expect(reviewed).toMatchObject({ reviewed_by: ids.founder, reply: 'Thanks, follow up on the late ones' });
    const { data: notices } = await admin.from('notifications').select('link').eq('recipient_id', ids.manager!).eq('kind', 'workload_report_reviewed');
    expect(notices!.some((notice) => notice.link === `/workload/reports/${reportId}`)).toBe(true);
  });

  it('lists Client Managers who have not sent the day report, for the Founder only', async () => {
    const { data: settings } = await admin.from('company_settings').select('working_days').single();
    const { data: holiday } = await admin.from('holidays').select('id').eq('holiday_date', today);
    const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const workingDay = (settings!.working_days as number[]).includes(weekday) && (holiday ?? []).length === 0;

    // The manager sent today's report above, so a second manager is missing.
    await people.addPerson('otherManager', 'Client Manager', 'Client Services', 'founder');
    const { data: missing } = await as.founder!.rpc('get_missing_daily_reports', { p_date: today });
    const names = (missing ?? []).map((row) => row.employee_id);
    expect(names.includes(ids.otherManager!)).toBe(workingDay);
    expect(names.includes(ids.manager!)).toBe(false);
    expect(names.includes(ids.hr!)).toBe(false);
    expect((await as.manager!.rpc('get_missing_daily_reports', { p_date: today })).data ?? []).toEqual([]);
  });

  it('does not let anyone call the reminder or the leave helpers directly', async () => {
    expect((await as.founder!.rpc('remind_daily_workload_reports' as never)).error).not.toBeNull();
    expect((await as.founder!.rpc('is_on_leave' as never, { p_employee: ids.designer!, p_day: today } as never)).error).not.toBeNull();
  });
});

describe('sub services that ask for no plan', () => {
  const people = createTestPeople(runId + 1);
  const { admin, clients: as } = people;

  it('never keeps a plan for them on a client', async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    const { data: website } = await admin.from('services').select('id, asks_plan').eq('name', 'Website Design & Development').single();
    const { data: seo } = await admin.from('services').select('id').eq('name', 'SEO').single();
    expect(website!.asks_plan).toBe(false);

    const { data: client } = await admin.from('clients').insert({ company_name: `No plan ${runId}`, client_manager_id: people.ids.manager! } as never).select('id').single();
    const saved = await as.manager!.rpc('set_client_services', {
      p_client: client!.id,
      p_services: [website!.id, seo!.id],
      p_plans: { [website!.id]: 'growth', [seo!.id]: 'growth' },
    });
    expect(saved.error).toBeNull();
    const plans = async () =>
      Object.fromEntries(((await admin.from('client_services').select('service_id, plan').eq('client_id', client!.id)).data ?? []).map((row) => [row.service_id, row.plan]));
    expect(await plans()).toEqual({ [website!.id]: null, [seo!.id]: 'growth' });

    // Turning the setting off for SEO clears its plans.
    await as.founder!.from('services').update({ asks_plan: false }).eq('id', seo!.id).select('id');
    expect((await plans())[seo!.id]).toBeNull();
    await admin.from('services').update({ asks_plan: true }).eq('id', seo!.id);
  });
});
