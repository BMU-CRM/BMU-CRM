// Calendar leave shows to managers, the department head and HR, not to colleagues; and
// moved deadlines are told to whoever assigned the task, except on one's own tasks.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('leave on the calendar and moved deadlines', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('lead', 'Employee', 'Design & Development', 'head');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'lead');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'head');

    const department = await people.departmentId('Design & Development');
    await admin.from('departments').update({ head_employee_id: ids.head! }).eq('id', department);
    const leaveType = (await admin.from('leave_types').select('id').limit(1).single()).data!.id;
    const { data: leave } = await admin
      .from('leave_requests')
      .insert({ employee_id: ids.designer!, leave_type_id: leaveType, start_date: '2027-04-05', end_date: '2027-04-05', reason: 'Family' })
      .select('id')
      .single();
    await as.hr!.from('leave_requests').update({ status: 'approved' }).eq('id', leave!.id).select('id');
  });

  async function seesDesignerLeave(key: string) {
    const { data } = await as[key]!.rpc('get_team_leave', { p_from: '2027-04-01', p_to: '2027-04-30' });
    return (data ?? []).some((row: { employee_id: string }) => row.employee_id === ids.designer);
  }

  it('shows it to the person, their managers, the department head and HR', async () => {
    expect(await seesDesignerLeave('designer')).toBe(true);
    expect(await seesDesignerLeave('lead')).toBe(true);
    expect(await seesDesignerLeave('head')).toBe(true);
    expect(await seesDesignerLeave('hr')).toBe(true);
  });

  it('no longer shows it to colleagues in the same department', async () => {
    expect(await seesDesignerLeave('colleague')).toBe(false);
  });

  async function deadlineNotices(key: string, title: string) {
    const { data } = await admin.from('notifications').select('body').eq('recipient_id', ids[key]!).eq('kind', 'task_rescheduled');
    return (data ?? []).filter((row) => row.body?.startsWith(title));
  }

  it('tells the assignee when whoever assigned a task moves its deadline, which the assignee cannot', async () => {
    const title = `Poster ${runId}`;
    const { data: task } = await as.head!.from('tasks').insert({ title, assignee_id: ids.designer!, created_by: ids.head!, due_date: '2027-04-10' }).select('id').single();
    const refused = await as.designer!.from('tasks').update({ due_date: '2027-04-14' }).eq('id', task!.id).select('id');
    expect(refused.error?.message).toContain('Only the person who assigned this task');
    await as.head!.from('tasks').update({ due_date: '2027-04-08' }).eq('id', task!.id).select('id');

    const toHead = await deadlineNotices('head', title);
    const toDesigner = await deadlineNotices('designer', title);
    expect(toHead).toEqual([]);
    expect(toDesigner.map((row) => row.body)).toEqual([`${title}: brought forward to 08 Apr 2027`]);
  });

  it('tells nobody when someone moves a task they gave themselves', async () => {
    const title = `Own task ${runId}`;
    const { data: task } = await as.designer!.from('tasks').insert({ title, assignee_id: ids.designer!, created_by: ids.designer!, due_date: '2027-04-10' }).select('id').single();
    const moved = await as.designer!.from('tasks').update({ due_date: '2027-04-20' }).eq('id', task!.id).select('due_date');
    expect(moved.data).toEqual([{ due_date: '2027-04-20' }]);

    expect(await deadlineNotices('lead', title)).toEqual([]);
    expect(await deadlineNotices('head', title)).toEqual([]);
    expect(await deadlineNotices('designer', title)).toEqual([]);
  });
});
