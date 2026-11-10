// Leave, attendance, meetings and support tickets, tested as real signed-in users.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

// A Monday to Friday week well in the future, with a holiday on the Wednesday.
const monday = '2027-03-01';
const wednesday = '2027-03-03';
const friday = '2027-03-05';
const saturday = '2027-03-06';
const sunday = '2027-03-07';

describe('leave, attendance, meetings and tickets', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let casualLeave = '';
  let unpaidLeave = '';
  let designDepartment = '';
  let holidayId = '';

  async function requestLeave(actor: Client, values: Record<string, unknown>) {
    return actor
      .from('leave_requests')
      .insert({ leave_type_id: casualLeave, reason: 'Family event', ...values } as never)
      .select('id, days, status, employee_id, approver_id')
      .single();
  }

  async function notificationKinds(key: string) {
    const { data } = await admin.from('notifications').select('kind, body').eq('recipient_id', ids[key]!);
    return data ?? [];
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('marketingHead', 'Digital Marketing Head', 'Digital Marketing', 'founder');
    await people.addPerson('marketer', 'Employee', 'Digital Marketing', 'marketingHead');

    designDepartment = await people.departmentId('Design & Development');
    await admin.from('departments').update({ head_employee_id: ids.designHead! }).eq('id', designDepartment);
    casualLeave = (await admin.from('leave_types').select('id').eq('name', 'Casual Leave').single()).data!.id;
    unpaidLeave = (await admin.from('leave_types').select('id').eq('name', 'Unpaid Leave').single()).data!.id;
    holidayId = (await admin.from('holidays').insert({ holiday_date: wednesday, name: `Test holiday ${runId}` }).select('id').single()).data!.id;
  });

  afterAll(async () => {
    const everyone = Object.values(ids);
    await admin.from('departments').update({ head_employee_id: null }).in('head_employee_id', everyone);
    await admin.from('leave_requests').delete().in('employee_id', everyone);
    await admin.from('attendance_records').delete().in('employee_id', everyone);
    await admin.from('meetings').delete().in('organizer_id', everyone);
    await admin.from('tickets').delete().in('requester_id', everyone);
    await admin.from('tasks').delete().in('created_by', everyone);
    await admin.from('holidays').delete().eq('id', holidayId);
    await people.removeEveryone();
  });

  it('keeps everything private from anonymous visitors', async () => {
    for (const table of ['leave_requests', 'attendance_records', 'meetings', 'tickets', 'holidays'] as const) {
      const { error } = await anonymousClient().from(table).select('*').limit(1);
      expect(error?.code, table).toBe('42501');
    }
  });

  describe('leave', () => {
    it('counts working days only, skipping weekends and holidays', async () => {
      const { data } = await requestLeave(as.designer!, { start_date: monday, end_date: sunday });

      expect(data?.days).toBe(4);
      expect(data?.approver_id).toBe(ids.designHead);
    });

    it('records the real employee, whatever is sent', async () => {
      const { data } = await requestLeave(as.developer!, {
        start_date: '2027-04-05',
        end_date: '2027-04-05',
        employee_id: ids.founder!,
        status: 'approved',
      });

      expect(data?.employee_id).toBe(ids.developer);
      expect(data?.status).toBe('pending');
    });

    it('refuses leave that falls only on days off', async () => {
      const { error } = await requestLeave(as.developer!, { start_date: saturday, end_date: sunday });

      expect(error?.message).toContain('days off or holidays');
    });

    it('counts a half day as half', async () => {
      const { data } = await requestLeave(as.developer!, { start_date: '2027-04-06', end_date: '2027-04-06', is_half_day: true });

      expect(data?.days).toBe(0.5);
    });

    it('refuses overlapping leave', async () => {
      const { error } = await requestLeave(as.designer!, { start_date: friday, end_date: friday });

      expect(error?.message).toContain('already have leave');
    });

    it('refuses more leave than is left, but allows unpaid leave', async () => {
      const tooMuch = await requestLeave(as.marketer!, { start_date: '2027-06-01', end_date: '2027-06-30' });
      const unpaid = await requestLeave(as.marketer!, { start_date: '2027-06-01', end_date: '2027-06-30', leave_type_id: unpaidLeave });

      expect(tooMuch.error?.message).toContain('Not enough Casual Leave');
      expect(unpaid.error).toBeNull();
    });

    it('shows a balance that counts pending requests', async () => {
      const { data } = await as.designer!.rpc('get_leave_balances', { p_year: 2027 });
      const casual = data?.find((row) => row.name === 'Casual Leave');

      expect(casual).toMatchObject({ yearly_allowance: 12, pending: 4, remaining: 8 });
    });

    it('hides one person\'s balance from a colleague', async () => {
      const { data } = await as.developer!.rpc('get_leave_balances', { p_employee: ids.designer!, p_year: 2027 });

      expect(data).toEqual([]);
    });

    it('lets the manager approve and tells the employee, but not someone outside the team', async () => {
      const { data: request } = await requestLeave(as.designer!, { start_date: '2027-05-03', end_date: '2027-05-03' });

      const outsider = await as.marketingHead!.from('leave_requests').update({ status: 'approved' }).eq('id', request!.id).select('id');
      const self = await as.designer!.from('leave_requests').update({ status: 'approved' }).eq('id', request!.id);
      const manager = await as.designHead!.from('leave_requests').update({ status: 'approved', decision_note: 'Enjoy' }).eq('id', request!.id);

      expect(outsider.data ?? []).toEqual([]);
      expect(self.error?.message).toContain('cannot change this leave');
      expect(manager.error).toBeNull();
      expect((await notificationKinds('designer')).some((n) => n.kind === 'leave_decided')).toBe(true);
      expect((await notificationKinds('designHead')).some((n) => n.kind === 'leave_requested')).toBe(true);
    });

    it('stops a request being edited after it is made', async () => {
      const { data: request } = await requestLeave(as.developer!, { start_date: '2027-05-10', end_date: '2027-05-10' });

      const { error } = await as.developer!.from('leave_requests').update({ end_date: '2027-05-20' }).eq('id', request!.id);

      expect(error?.message).toContain('cannot be edited');
    });

    it('lets people cancel their own pending leave', async () => {
      const { data: request } = await requestLeave(as.developer!, { start_date: '2027-05-11', end_date: '2027-05-11' });

      const { error } = await as.developer!.from('leave_requests').update({ status: 'cancelled' }).eq('id', request!.id);

      expect(error).toBeNull();
    });

    it('shows approved leave to the department, without the reason', async () => {
      const team = await as.developer!.rpc('get_team_leave', { p_from: '2027-05-01', p_to: '2027-05-31' });
      const other = await as.marketer!.rpc('get_team_leave', { p_from: '2027-05-01', p_to: '2027-05-31' });
      const reasons = await as.developer!.from('leave_requests').select('reason').eq('employee_id', ids.designer!);

      expect(team.data?.some((row) => row.full_name === 'Test designer')).toBe(true);
      expect(other.data?.some((row) => row.full_name === 'Test designer')).toBe(false);
      expect(reasons.data).toEqual([]);
    });
  });

  describe('attendance', () => {
    it('checks in and out once a day, using the server clock', async () => {
      expect((await as.designer!.rpc('attendance_check_in')).error).toBeNull();
      expect((await as.designer!.rpc('attendance_check_in')).error?.message).toContain('already checked in');
      expect((await as.designer!.rpc('attendance_check_out')).error).toBeNull();
      expect((await as.designer!.rpc('attendance_check_out')).error?.message).toContain('already checked out');
    });

    it('stops people writing or correcting their own attendance', async () => {
      const insert = await as.developer!.from('attendance_records').insert({ employee_id: ids.developer!, work_date: '2027-01-04' });
      const { data: record } = await admin.from('attendance_records').select('id').eq('employee_id', ids.designer!).single();
      const update = await as.designer!.from('attendance_records').update({ check_in_at: '2020-01-01T03:00:00Z' }).eq('id', record!.id).select('id');

      expect(insert.error?.code).toBe('42501');
      expect(update.data ?? []).toEqual([]);
    });

    it('lets HR correct a record, marked as manual', async () => {
      const { data } = await as.founder!
        .from('attendance_records')
        .insert({ employee_id: ids.developer!, work_date: '2027-01-04', check_in_at: '2027-01-04T04:00:00Z', source: 'web' })
        .select('source, updated_by')
        .single();

      expect(data).toEqual({ source: 'manual', updated_by: ids.founder });
    });

    it('stops a head without correction rights from editing attendance', async () => {
      const { error } = await as.designHead!.from('attendance_records').insert({ employee_id: ids.developer!, work_date: '2027-01-05' });

      expect(error?.code).toBe('42501');
    });

    it('imports rows by email or employee ID, without overwriting manual corrections', async () => {
      const { data: developer } = await admin.from('employees').select('employee_code, work_email').eq('id', ids.developer!).single();

      const { data } = await as.founder!.rpc('import_attendance', {
        p_rows: [
          { employee: developer!.employee_code, date: '2027-01-04', check_in: '11:00', check_out: '19:00' },
          { employee: developer!.work_email, date: '2027-01-06', check_in: '09:31', check_out: '18:40' },
          { employee: 'nobody@nowhere', date: '2027-01-06', check_in: '09:00' },
        ],
      });
      const { data: kept } = await admin.from('attendance_records').select('source, check_in_at').eq('employee_id', ids.developer!).eq('work_date', '2027-01-04').single();
      const { data: imported } = await admin.from('attendance_records').select('source, check_in_at').eq('employee_id', ids.developer!).eq('work_date', '2027-01-06').single();

      expect(data).toMatchObject({ imported: 3 - 1 });
      expect((data as { errors: unknown[] }).errors).toHaveLength(1);
      expect(kept).toEqual({ source: 'manual', check_in_at: '2027-01-04T04:00:00+00:00' });
      expect(imported).toEqual({ source: 'import', check_in_at: '2027-01-06T04:01:00+00:00' });
    });

    it('stops people without rights importing attendance', async () => {
      const { error } = await as.developer!.rpc('import_attendance', { p_rows: [] });

      expect(error?.code).toBe('42501');
    });

    it('limits report data to the viewer scope', async () => {
      const own = await as.developer!.rpc('get_attendance_report_data', { p_from: '2027-01-01', p_to: '2027-01-31' });
      const head = await as.designHead!.rpc('get_attendance_report_data', { p_from: '2027-01-01', p_to: '2027-01-31' });

      const names = (data: unknown) => (data as { employees: { name: string }[] }).employees.map((e) => e.name);
      expect(names(own.data)).toEqual(['Test developer']);
      expect(names(head.data)).toEqual(expect.arrayContaining(['Test designer', 'Test developer', 'Test designHead']));
      expect(names(head.data)).not.toContain('Test marketer');
    });
  });

  describe('meetings', () => {
    let meetingId = '';

    it('records the organiser and keeps the meeting private to the people invited', async () => {
      const { data } = await as.designHead!
        .from('meetings')
        .insert({ title: `Sprint review ${runId}`, starts_at: '2027-02-01T05:00:00Z', ends_at: '2027-02-01T06:00:00Z', organizer_id: ids.founder! })
        .select('id, organizer_id')
        .single();
      meetingId = data!.id;
      await as.designHead!.from('meeting_participants').insert({ meeting_id: meetingId, employee_id: ids.designer! });

      expect(data?.organizer_id).toBe(ids.designHead);
      expect((await as.designer!.from('meetings').select('id').eq('id', meetingId)).data).toHaveLength(1);
      expect((await as.marketer!.from('meetings').select('id').eq('id', meetingId)).data).toEqual([]);
      expect((await as.founder!.from('meetings').select('id').eq('id', meetingId)).data).toHaveLength(1);
      expect((await notificationKinds('designer')).some((n) => n.kind === 'meeting_invited')).toBe(true);
    });

    it('lets participants add notes but not move the meeting', async () => {
      const notes = await as.designer!.from('meetings').update({ notes: 'Agreed the scope' }).eq('id', meetingId);
      const move = await as.designer!.from('meetings').update({ starts_at: '2027-02-02T05:00:00Z', ends_at: '2027-02-02T06:00:00Z' }).eq('id', meetingId);

      expect(notes.error).toBeNull();
      expect(move.error?.message).toContain('Only the organiser');
    });

    it('lets people answer only their own invitation', async () => {
      const own = await as.designer!.from('meeting_participants').update({ response: 'accepted' }).eq('meeting_id', meetingId).eq('employee_id', ids.designer!).select('responded_at');
      const other = await as.developer!.from('meeting_participants').update({ response: 'declined' }).eq('meeting_id', meetingId).eq('employee_id', ids.designer!).select('meeting_id');

      expect(own.data?.[0]?.responded_at).not.toBeNull();
      expect(other.data ?? []).toEqual([]);
    });

    it('tells participants when the time changes or the meeting is cancelled', async () => {
      await as.designHead!.from('meetings').update({ starts_at: '2027-02-01T07:00:00Z', ends_at: '2027-02-01T08:00:00Z' }).eq('id', meetingId);
      await as.designHead!.from('meetings').update({ status: 'cancelled' }).eq('id', meetingId);

      const kinds = (await notificationKinds('designer')).map((n) => n.kind);
      expect(kinds).toEqual(expect.arrayContaining(['meeting_changed', 'meeting_cancelled']));
    });

    it('reminds people once, shortly before a meeting', async () => {
      const startsAt = new Date(Date.now() + 10 * 60_000);
      const { data } = await as.designHead!
        .from('meetings')
        .insert({ title: `Stand-up ${runId}`, starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 900_000).toISOString() })
        .select('id')
        .single();
      await as.designHead!.from('meeting_participants').insert({ meeting_id: data!.id, employee_id: ids.developer! });

      await admin.rpc('send_meeting_reminders');
      await admin.rpc('send_meeting_reminders');

      const reminders = (await notificationKinds('developer')).filter((n) => n.kind === 'meeting_reminder' && n.body?.includes(`Stand-up ${runId}`));
      expect(reminders).toHaveLength(1);
    });

    it('stops follow-up tasks pointing at a meeting you cannot see', async () => {
      const { error } = await as.marketer!.from('tasks').insert({ title: 'Sneaky', meeting_id: meetingId });

      expect(error?.message).toContain('cannot link a task to that meeting');
    });
  });

  describe('support tickets', () => {
    let ticketId = '';

    it('routes a ticket to the handling department and tells its head', async () => {
      const { data: category } = await admin.from('ticket_categories').select('id').eq('name', 'Technical issue').single();
      const { data, error } = await as.marketer!
        .from('tickets')
        .insert({ title: `Laptop will not start ${runId}`, description: 'Black screen since this morning.', category_id: category!.id, requester_id: ids.founder!, status: 'resolved' })
        .select('id, requester_id, handling_department_id, status')
        .single();
      ticketId = data!.id;

      expect(error).toBeNull();
      expect(data).toMatchObject({ requester_id: ids.marketer, handling_department_id: designDepartment, status: 'open' });
      expect((await notificationKinds('designHead')).some((n) => n.kind === 'ticket_raised')).toBe(true);
    });

    it('shows a ticket to the requester and the handling department only', async () => {
      expect((await as.designHead!.from('tickets').select('id').eq('id', ticketId)).data).toHaveLength(1);
      expect((await as.marketer!.from('tickets').select('id').eq('id', ticketId)).data).toHaveLength(1);
      expect((await as.developer!.from('tickets').select('id').eq('id', ticketId)).data).toEqual([]);
    });

    it('lets the head assign it within the department only', async () => {
      const outside = await as.designHead!.from('tickets').update({ assigned_to: ids.marketer! }).eq('id', ticketId);
      const inside = await as.designHead!.from('tickets').update({ assigned_to: ids.developer! }).eq('id', ticketId).select('status');

      expect(outside.error?.message).toContain('handling department');
      expect(inside.data?.[0]?.status).toBe('assigned');
      expect((await as.developer!.from('tickets').select('id').eq('id', ticketId)).data).toHaveLength(1);
    });

    it('stops the requester changing priority or resolving their own ticket', async () => {
      const priority = await as.marketer!.from('tickets').update({ priority: 'urgent' }).eq('id', ticketId);
      const resolve = await as.marketer!.from('tickets').update({ status: 'resolved', resolution: 'Fixed it myself' }).eq('id', ticketId);

      expect(priority.error?.message).toContain('Only the support team');
      expect(resolve.error).not.toBeNull();
    });

    it('needs a resolution, then lets the requester close or reopen it', async () => {
      await as.developer!.from('tickets').update({ status: 'in_progress' }).eq('id', ticketId);
      const withoutResolution = await as.developer!.from('tickets').update({ status: 'resolved' }).eq('id', ticketId);
      const resolved = await as.developer!.from('tickets').update({ status: 'resolved', resolution: 'Replaced the charger.' }).eq('id', ticketId);
      const reopened = await as.marketer!.from('tickets').update({ status: 'open' }).eq('id', ticketId);

      expect(withoutResolution.error?.message).toContain('Describe how');
      expect(resolved.error).toBeNull();
      expect(reopened.error).toBeNull();
      expect((await notificationKinds('marketer')).some((n) => n.kind === 'ticket_updated')).toBe(true);
    });

    it('shows ticket attachments to the people handling it', async () => {
      const { data: file } = await as.marketer!.from('files').insert({ kind: 'link', name: 'Error photo', external_url: 'https://example.com/photo', ticket_id: ticketId }).select('id').single();

      expect((await as.developer!.from('files').select('id').eq('id', file!.id)).data).toHaveLength(1);
      expect((await as.designer!.from('files').select('id').eq('id', file!.id)).data).toEqual([]);
      await admin.from('files').delete().eq('id', file!.id);
    });
  });
});
