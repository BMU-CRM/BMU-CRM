import 'server-only';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { clientLabelFor } from './clientService';
import { getTeamLeave } from './hrService';

async function myMeetingIds(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('meeting_participants')
    .select('meeting_id')
    .eq('employee_id', access.employee.id)
    .neq('response', 'declined');
  if (error) throw error;
  return data.map((row) => row.meeting_id);
}

// The calendar shows the person's own meetings, even for people who can see everyone's.
async function listMyMeetings(access: CurrentAccess, from: string, to: string) {
  const database = await createDatabaseClient();
  const ids = await myMeetingIds(access);
  const idFilter = ids.length > 0 ? `,id.in.(${ids.join(',')})` : '';

  const { data, error } = await database
    .from('meetings')
    .select('id, title, kind, status, starts_at, ends_at, location, category:calendar_categories(name)')
    .or(`organizer_id.eq.${access.employee.id}${idFilter}`)
    .gte('starts_at', `${from}T00:00:00+05:30`)
    .lte('starts_at', `${to}T23:59:59+05:30`)
    .order('starts_at');
  if (error) throw error;
  return data;
}

export type CalendarItem = {
  id: string;
  kind: 'meeting' | 'task' | 'leave' | 'holiday';
  date: string;
  title: string;
  time: string | null;
  href: string | null;
  isCancelled?: boolean;
  // An approved or completed task, or a meeting that has ended. Shown struck through.
  isDone?: boolean;
  // An open task of the person's own, which they can move to another day.
  canMove?: boolean;
};

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export async function getCalendarItems(access: CurrentAccess, from: string, to: string) {
  const database = await createDatabaseClient();

  const [meetings, tasks, leave, holidays] = await Promise.all([
    listMyMeetings(access, from, to),
    // Finished work stays on the calendar, struck through. Rejected work does not.
    database
      .from('tasks')
      .select('id, title, due_date, due_time, status, meeting_id')
      .eq('assignee_id', access.employee.id)
      .neq('status', 'rejected')
      .gte('due_date', from)
      .lte('due_date', to),
    getTeamLeave(from, to),
    database.from('holidays').select('id, holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
  ]);
  if (tasks.error) throw tasks.error;
  if (holidays.error) throw holidays.error;
  const now = Date.now();
  // Content work comes to its people as a task, which they start and submit; the entry
  // itself would only repeat it, so it shows for the planner but not for them.
  const entriesWithMyTask = new Set(tasks.data.flatMap((task) => (task.meeting_id ? [task.meeting_id] : [])));
  const contentEntries = new Set(meetings.flatMap((meeting) => (meeting.category ? [meeting.id] : [])));

  const items: CalendarItem[] = [
    ...holidays.data.map((holiday) => ({
      id: holiday.id,
      kind: 'holiday' as const,
      date: holiday.holiday_date,
      title: holiday.name,
      time: null,
      href: null,
    })),
    ...meetings.filter((meeting) => !(meeting.category && entriesWithMyTask.has(meeting.id))).map((meeting) => ({
      id: meeting.id,
      kind: 'meeting' as const,
      date: datePartInIndia(meeting.starts_at),
      // Content work shows its category first, such as "Posters and design: Diwali post".
      title: meeting.category ? `${meeting.category.name}: ${meeting.title}` : meeting.title,
      time: `${clock.format(new Date(meeting.starts_at))} to ${clock.format(new Date(meeting.ends_at))}`,
      href: `/meetings/${meeting.id}`,
      isCancelled: meeting.status === 'cancelled',
      isDone: meeting.status === 'completed' || (meeting.status === 'scheduled' && new Date(meeting.ends_at).getTime() < now),
    })),
    ...tasks.data.map((task) => ({
      id: task.id,
      kind: 'task' as const,
      date: task.due_date as string,
      // Content work already reads "Posters and design: …", so it needs no "Due:".
      title: task.status === 'completed' ? `Done: ${task.title}` : task.meeting_id && contentEntries.has(task.meeting_id) ? task.title : `Due: ${task.title}`,
      time: task.due_time ? task.due_time.slice(0, 5) : null,
      href: `/tasks/${task.id}`,
      isDone: task.status === 'completed',
      canMove: task.status !== 'completed',
    })),
  ];

  // Leave spans several days, so it appears on each one in the range.
  for (const entry of leave) {
    for (let day = entry.start_date; day <= entry.end_date; ) {
      if (day >= from && day <= to) {
        items.push({
          id: `${entry.request_id}-${day}`,
          kind: 'leave',
          date: day,
          title: `${entry.full_name} on ${entry.leave_type.toLowerCase()}${entry.is_half_day ? ' (half day)' : ''}`,
          time: null,
          href: null,
        });
      }
      const next = new Date(`${day}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      day = next.toISOString().slice(0, 10);
    }
  }

  const order = { holiday: 0, leave: 1, meeting: 2, task: 3 };
  return items.sort((first, second) => {
    if (first.date !== second.date) return first.date < second.date ? -1 : 1;
    if (first.kind !== second.kind) return order[first.kind] - order[second.kind];
    return (first.time ?? '').localeCompare(second.time ?? '');
  });
}

// Content calendar categories with the people each goes to.
export async function listCalendarCategories() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('calendar_categories')
    .select('id, name, description, is_active, sort_order, members:calendar_category_members(employee:employees(id, full_name))')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data.map((category) => ({
    ...category,
    members: category.members.flatMap((member) => (member.employee ? [member.employee] : [])).sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));
}

export type CalendarCategory = Awaited<ReturnType<typeof listCalendarCategories>>[number];

export async function listUpcomingMeetings(access: CurrentAccess, limit: number) {
  const database = await createDatabaseClient();
  const ids = await myMeetingIds(access);
  const idFilter = ids.length > 0 ? `,id.in.(${ids.join(',')})` : '';

  const { data, error } = await database
    .from('meetings')
    .select('id, title, starts_at, ends_at, location, meeting_link')
    .or(`organizer_id.eq.${access.employee.id}${idFilter}`)
    .eq('status', 'scheduled')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(limit);
  if (error) throw error;
  return data;
}

// Meetings about a client that this person may see, newest first.
export async function listClientMeetings(clientId: string, limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('meetings')
    .select('id, title, status, starts_at, ends_at, organizer:employees!meetings_organizer_id_fkey(full_name)')
    .eq('client_id', clientId)
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getMeeting(meetingId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('meetings')
    .select(
      `*,
       organizer:employees!meetings_organizer_id_fkey(id, full_name),
       client:clients(id, company_name),
       project:projects(id, name),
       category:calendar_categories(id, name),
       participants:meeting_participants(response, employee:employees(id, full_name))`,
    )
    .eq('id', meetingId)
    .maybeSingle();

  if (error) throw error;
  return data && { ...data, client: data.client ?? (await clientLabelFor(data.client_id)) };
}

export type MeetingDetails = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

export async function listMeetingFollowUps(meetingId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tasks')
    .select('id, title, status, due_date, assignee:employees!tasks_assignee_id_fkey(full_name)')
    .eq('meeting_id', meetingId)
    .order('created_at');
  if (error) throw error;
  return data;
}
