// The content calendar (categories that bring their people into an entry), deleting
// files for good, and deleting unused leave types.
import { beforeAll, describe, expect, it } from 'vitest';
import { isStillInUse } from '@/lib/actionResult';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

describe('content calendar, file and leave type deletion', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let category = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('planner', 'Client Manager', 'Management', 'founder');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('editor', 'Employee', 'Design & Development', 'founder');
    const { data, error } = await as.planner!.from('calendar_categories').insert({ name: `Posters ${runId}` }).select('id').single();
    expect(error).toBeNull();
    category = data!.id;
    const members = await as.planner!.from('calendar_category_members').insert([{ category_id: category, employee_id: ids.designer! }]).select('employee_id');
    expect(members.data).toHaveLength(1);
  });

  const entry = (extra: Record<string, unknown> = {}) => ({
    title: `Diwali poster ${runId}`,
    kind: 'content' as const,
    starts_at: `${today}T05:00:00Z`,
    ends_at: `${today}T06:00:00Z`,
    ...extra,
  });

  describe('the content calendar', () => {
    it('has the three categories asked for', async () => {
      const { data } = await admin.from('calendar_categories').select('name').in('name', ['Posters and design', 'Video shoot', 'Social media reels and stories']);
      expect(data).toHaveLength(3);
    });

    it('lets only content planners file entries under a category, or change the categories', async () => {
      const blocked = await as.designer!.from('meetings').insert(entry({ category_id: category }));
      expect(blocked.error?.message).toContain('content calendar');
      expect((await as.designer!.from('calendar_categories').insert({ name: `Nope ${runId}` })).error).not.toBeNull();
      expect((await as.designer!.from('calendar_categories').select('id').eq('id', category)).data).toHaveLength(1);
    });

    it('leaves content planning to the Founder and Client Managers, not HR', async () => {
      const blocked = await as.hr!.from('meetings').insert(entry({ category_id: category }));
      expect(blocked.error?.message).toContain('content calendar');
      expect((await as.hr!.from('calendar_categories').insert({ name: `HR ${runId}` })).error).not.toBeNull();
      // HR still has an ordinary calendar.
      const meeting = await as.hr!.from('meetings').insert(entry({ title: `HR meeting ${runId}`, kind: 'internal' })).select('id');
      expect(meeting.data).toHaveLength(1);
    });

    it('adds and notifies the category\'s people, so it is in their calendar', async () => {
      const { data, error } = await as.planner!.from('meetings').insert(entry({ category_id: category })).select('id').single();
      expect(error).toBeNull();
      const { data: participants } = await admin.from('meeting_participants').select('employee_id').eq('meeting_id', data!.id);
      expect(participants!.map((row) => row.employee_id)).toEqual([ids.designer!]);

      expect((await as.designer!.from('meetings').select('id').eq('id', data!.id)).data).toHaveLength(1);
      expect((await as.editor!.from('meetings').select('id').eq('id', data!.id)).data).toEqual([]);
    });

    it('gives each of the category\'s people a task for it, and tells them once', async () => {
      const { data } = await as.planner!
        .from('meetings')
        .insert(entry({ title: `Offer poster ${runId}`, category_id: category, agenda: 'Use the new logo', starts_at: '2027-01-15T05:30:00Z', ends_at: '2027-01-15T06:30:00Z' }))
        .select('id')
        .single();
      const { data: tasks } = await admin.from('tasks').select('id, title, description, assignee_id, created_by, status, due_date, due_time').eq('meeting_id', data!.id);
      expect(tasks).toEqual([
        expect.objectContaining({
          title: `Posters ${runId}: Offer poster ${runId}`,
          description: 'Use the new logo',
          assignee_id: ids.designer!,
          created_by: ids.planner!,
          status: 'assigned',
          due_date: '2027-01-15',
          due_time: '11:00:00',
        }),
      ]);

      const { data: notes } = await admin.from('notifications').select('kind, title, body').eq('recipient_id', ids.designer!).ilike('body', `%Offer poster ${runId}%`);
      expect(notes!.map((note) => note.kind)).toEqual(['task_assigned']);

      // The designer works on it like any task.
      expect((await as.designer!.from('tasks').update({ status: 'accepted' }).eq('id', tasks![0]!.id).select('id')).data).toHaveLength(1);
      expect((await as.designer!.from('tasks').update({ status: 'in_progress' }).eq('id', tasks![0]!.id).select('work_started_at')).data![0]!.work_started_at).not.toBeNull();

      // Moving the entry moves the open task with it.
      await as.planner!.from('meetings').update({ starts_at: '2027-01-16T08:30:00Z', ends_at: '2027-01-16T09:30:00Z' }).eq('id', data!.id).select('id');
      const { data: moved } = await admin.from('tasks').select('due_date, due_time').eq('id', tasks![0]!.id).single();
      expect(moved).toEqual({ due_date: '2027-01-16', due_time: '14:00:00' });
    });

    it('brings in a new category\'s people when an entry is moved to it', async () => {
      const { data: other } = await as.planner!.from('calendar_categories').insert({ name: `Reels ${runId}` }).select('id').single();
      await as.planner!.from('calendar_category_members').insert({ category_id: other!.id, employee_id: ids.editor! });
      const { data } = await as.planner!.from('meetings').insert(entry({ title: `Reel ${runId}` })).select('id').single();
      expect((await admin.from('meeting_participants').select('employee_id').eq('meeting_id', data!.id)).data).toEqual([]);
      const moved = await as.planner!.from('meetings').update({ category_id: other!.id }).eq('id', data!.id).select('id');
      expect(moved.data).toHaveLength(1);
      expect((await admin.from('meeting_participants').select('employee_id').eq('meeting_id', data!.id)).data).toEqual([{ employee_id: ids.editor! }]);
    });

    it('refuses a category that is not in use', async () => {
      const { data: old } = await as.planner!.from('calendar_categories').insert({ name: `Old ${runId}`, is_active: false }).select('id').single();
      expect((await as.planner!.from('meetings').insert(entry({ category_id: old!.id }))).error?.message).toContain('in use');
    });
  });

  describe('deleting files', () => {
    async function link(owner: string, name: string) {
      const { data, error } = await as[owner]!.from('files').insert({ kind: 'link', name, external_url: 'https://example.com/file' }).select('id').single();
      expect(error).toBeNull();
      return data!.id;
    }

    it('lets the owner delete their file, but nobody else without wider access', async () => {
      const id = await link('designer', `Mine ${runId}`);
      expect((await as.editor!.rpc('delete_file', { p_file: id })).error?.message).toContain('permission');
      const { error } = await as.designer!.rpc('delete_file', { p_file: id });
      expect(error).toBeNull();
      expect((await admin.from('files').select('id').eq('id', id)).data).toEqual([]);
      const { data: audit } = await admin.from('audit_logs').select('action').eq('entity_id', id);
      expect(audit!.map((row) => row.action)).toHaveLength(2);
    });

    it('keeps a file that is a receipt on a money record', async () => {
      const id = await link('founder', `Receipt ${runId}`);
      const travel = (await admin.from('finance_categories').select('id').eq('name', 'Travel').single()).data!.id;
      const cash = (await admin.from('bank_accounts').select('id').eq('account_type', 'cash').single()).data!.id;
      const expense = await as.founder!.from('expense_records').insert({ category_id: travel, spent_on: today, amount: 10, method: 'cash', bank_account_id: cash, receipt_file_id: id });
      expect(expense.error).toBeNull();
      expect((await as.founder!.rpc('delete_file', { p_file: id })).error?.message).toContain('receipt or bill');
    });
  });

  describe('deleting leave types', () => {
    it('deletes an unused type, and refuses one that has been used', async () => {
      const unused = await as.hr!.from('leave_types').insert({ name: `Unused ${runId}`, yearly_allowance: 1 }).select('id').single();
      expect((await as.hr!.from('leave_types').delete().eq('id', unused.data!.id).select('id')).data).toHaveLength(1);

      const used = await as.hr!.from('leave_types').insert({ name: `Used ${runId}`, yearly_allowance: 5 }).select('id').single();
      const request = await as.designer!.from('leave_requests').insert({
        employee_id: ids.designer!, leave_type_id: used.data!.id, start_date: '2027-02-01', end_date: '2027-02-01', reason: 'Family function',
      });
      expect(request.error).toBeNull();
      const { error } = await as.hr!.from('leave_types').delete().eq('id', used.data!.id);
      expect(error).not.toBeNull();
      expect(isStillInUse(error!)).toBe(true);
    });
  });
});
