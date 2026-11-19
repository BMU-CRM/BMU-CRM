// Dates of assigned work: the employee doing a task someone else assigned cannot
// postpone or bring it forward; the person who assigned it, the department head and the
// Founder can. People still move tasks they gave themselves.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('who moves a task date', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'designHead');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', await people.departmentId('Design & Development'));
  });

  const due = async (id: string) => (await admin.from('tasks').select('due_date, due_time').eq('id', id).single()).data!;
  const moveDate = (who: Client, id: string, date: string) => who.from('tasks').update({ due_date: date }).eq('id', id).select('id');
  const moveTime = (who: Client, id: string, time: string) => who.from('tasks').update({ due_time: time }).eq('id', id).select('id');

  async function assigned(by: Client) {
    const { data, error } = await by.from('tasks').insert({ title: `Dated ${runId}`, assignee_id: ids.designer!, due_date: '2026-12-10' }).select('id').single();
    expect(error).toBeNull();
    return data!.id;
  }

  it('stops the employee moving the date or time of work assigned to them', async () => {
    const id = await assigned(as.designHead!);
    await as.designer!.from('tasks').update({ status: 'accepted' }).eq('id', id);

    const later = await moveDate(as.designer!, id, '2026-12-20');
    expect(later.error?.message).toContain('Only the person who assigned this task, your department head or the Founder');
    const earlier = await moveDate(as.designer!, id, '2026-12-05');
    expect(earlier.error?.message).toContain('Ask them in chat');
    const time = await moveTime(as.designer!, id, '15:00');
    expect(time.error?.message).toContain('Only the person who assigned this task');
    expect(await due(id)).toEqual({ due_date: '2026-12-10', due_time: null });

    // Their other work on it still goes ahead.
    expect((await as.designer!.from('tasks').update({ status: 'in_progress' }).eq('id', id).select('id')).data).toHaveLength(1);
  });

  it('lets the person who assigned it, the department head and the Founder move it', async () => {
    // Assigned by the Founder; moved by the Founder and by the department head.
    const byManager = await assigned(as.founder!);
    expect((await moveDate(as.founder!, byManager, '2026-12-15')).data).toHaveLength(1);
    expect((await moveDate(as.designHead!, byManager, '2026-12-16')).data).toHaveLength(1);
    expect((await moveDate(as.founder!, byManager, '2026-12-08')).data).toHaveLength(1);
    expect((await moveTime(as.designHead!, byManager, '11:30')).data).toHaveLength(1);
    expect(await due(byManager)).toEqual({ due_date: '2026-12-08', due_time: '11:30:00' });

    // A colleague cannot.
    expect((await moveDate(as.developer!, byManager, '2026-12-30')).data ?? []).toHaveLength(0);
    expect((await due(byManager)).due_date).toBe('2026-12-08');
  });

  it('still lets people move tasks they gave themselves', async () => {
    const { data } = await as.designer!.from('tasks').insert({ title: `Own ${runId}`, assignee_id: ids.designer!, due_date: '2026-12-10' }).select('id').single();
    expect((await moveDate(as.designer!, data!.id, '2026-12-12')).error).toBeNull();
    expect((await moveTime(as.designer!, data!.id, '10:00')).error).toBeNull();
    expect(await due(data!.id)).toEqual({ due_date: '2026-12-12', due_time: '10:00:00' });
  });
});
