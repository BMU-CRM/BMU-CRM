// Submitting a task for review: the dates are kept, and progress follows the review.
// 75% on the first submission, 2% more on each one after rework, 100% on approval.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('task submissions and progress', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', await people.departmentId('Design & Development'));
  });

  const row = async (id: string) =>
    (await admin.from('tasks').select('status, completion_percentage, first_submitted_at, submitted_at, submission_count, completed_at, verified_by').eq('id', id).single()).data!;
  const move = (actor: Client, id: string, status: string) => actor.from('tasks').update({ status: status as never }).eq('id', id).select('id');

  async function newTask() {
    const { data, error } = await as.designHead!.from('tasks').insert({ title: `Submission ${runId}`, assignee_id: ids.designer! }).select('id').single();
    expect(error).toBeNull();
    for (const status of ['accepted', 'in_progress']) expect((await move(as.designer!, data!.id, status)).error).toBeNull();
    return data!.id;
  }

  it('goes to 75% on the first submission and keeps the date', async () => {
    const id = await newTask();
    expect((await as.designer!.from('tasks').update({ completion_percentage: 60 }).eq('id', id).select('id')).error).toBeNull();
    expect((await move(as.designer!, id, 'under_review')).error).toBeNull();
    const task = await row(id);
    expect(task).toMatchObject({ status: 'under_review', completion_percentage: 75, submission_count: 1 });
    expect(task.first_submitted_at).not.toBeNull();
    expect(task.submitted_at).toBe(task.first_submitted_at);
  });

  it('adds 2% for each resubmission after rework, then 100% on approval', async () => {
    const id = await newTask();
    await move(as.designer!, id, 'under_review');
    const first = (await row(id)).first_submitted_at;

    for (const expected of [77, 79]) {
      expect((await move(as.designHead!, id, 'changes_requested')).error).toBeNull();
      expect((await row(id)).completion_percentage).toBe(expected - 2);
      await move(as.designer!, id, 'in_progress');
      await move(as.designer!, id, 'under_review');
      const task = await row(id);
      expect(task.completion_percentage).toBe(expected);
      expect(task.first_submitted_at).toBe(first);
    }
    expect((await row(id)).submission_count).toBe(3);

    expect((await move(as.designHead!, id, 'completed')).error).toBeNull();
    const approved = await row(id);
    expect(approved).toMatchObject({ completion_percentage: 100, verified_by: ids.designHead });
    expect(approved.completed_at).not.toBeNull();

    // Reopened for rework: back to the last submission's 79%, then 81% when resubmitted.
    expect((await move(as.designHead!, id, 'changes_requested')).error).toBeNull();
    expect((await row(id)).completion_percentage).toBe(79);
    await move(as.designer!, id, 'in_progress');
    await move(as.designer!, id, 'under_review');
    expect((await row(id)).completion_percentage).toBe(81);
  });

  it('never goes past 99% before approval', async () => {
    const id = await newTask();
    await move(as.designer!, id, 'under_review');
    for (let round = 0; round < 14; round += 1) {
      await move(as.designHead!, id, 'changes_requested');
      await move(as.designer!, id, 'in_progress');
      await move(as.designer!, id, 'under_review');
    }
    expect((await row(id)).completion_percentage).toBe(99);
  });

  it('allows typed-in progress only below 75% and only before the first submission', async () => {
    const id = await newTask();
    const tooHigh = await as.designer!.from('tasks').update({ completion_percentage: 80 }).eq('id', id).select('id');
    expect(tooHigh.error?.message).toContain('75%');
    await move(as.designer!, id, 'under_review');
    await move(as.designHead!, id, 'changes_requested');
    await move(as.designer!, id, 'in_progress');
    const after = await as.designer!.from('tasks').update({ completion_percentage: 50 }).eq('id', id).select('id');
    expect(after.error?.message).toContain('automatically');
  });

  it('does not let anyone type in the submission dates', async () => {
    const id = await newTask();
    const typed = await as.designHead!.from('tasks').update({ submission_count: 5 } as never).eq('id', id).select('id');
    expect(typed.error?.message).toContain('automatically');
  });
});
