'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { indiaDateTime } from '@/lib/calendar/calendarRange';
import { parseCalendarSheet } from '@/lib/calendar/parseCalendarSheet';
import { readSpreadsheet } from '@/lib/csv/readSpreadsheet';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { calendarCategorySchema, meetingNotesSchema, meetingSchema } from '@/lib/validation/meetingSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function saveMeetingAction(
  meetingId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.meetingsCreate);
  if (!access) return failure(noPermission);

  const parsed = meetingSchema.safeParse({
    title: formData.get('title'),
    agenda: formData.get('agenda') ?? '',
    kind: formData.get('kind'),
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    location: formData.get('location') ?? '',
    meetingLink: formData.get('meetingLink') ?? '',
    clientId: formData.get('clientId') ?? '',
    projectId: formData.get('projectId') ?? '',
    categoryId: formData.get('categoryId') ?? '',
    participantIds: formData.getAll('participantIds'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  // Only content planners see the category; for anyone else it is left as it was.
  const plansContent = access.permissions[permissionKeys.contentCalendarManage] !== undefined;
  const row = {
    ...(plansContent ? { category_id: values.categoryId } : {}),
    title: values.title,
    agenda: values.agenda,
    kind: values.kind,
    starts_at: indiaDateTime(values.date, values.startTime),
    ends_at: indiaDateTime(values.date, values.endTime),
    location: values.location,
    meeting_link: values.meetingLink,
    client_id: values.clientId,
    project_id: values.projectId,
  };

  const database = await createDatabaseClient();
  let savedId = meetingId;

  if (meetingId) {
    const { data, error } = await database.from('meetings').update(row).eq('id', meetingId).select('id');
    if (error) return databaseFailure(error);
    if (data.length === 0) return failure(noPermission);
  } else {
    const { data, error } = await database.from('meetings').insert(row).select('id').single();
    if (error) return databaseFailure(error);
    savedId = data.id;
  }

  // Brings the guest list in line with the form: new people are invited, removed
  // people are taken off. Existing answers are kept. The category's people always stay
  // (the database adds them when the category is set).
  const { data: saved } = await database.from('meetings').select('category_id').eq('id', savedId as string).single();
  const categoryPeople = saved?.category_id
    ? ((await database.from('calendar_category_members').select('employee_id').eq('category_id', saved.category_id)).data ?? []).map((row) => row.employee_id)
    : [];
  const wanted = new Set([...values.participantIds, ...categoryPeople].filter((id) => id !== access.employee.id));
  const { data: current } = await database
    .from('meeting_participants')
    .select('employee_id')
    .eq('meeting_id', savedId as string);
  const existing = new Set((current ?? []).map((row) => row.employee_id));

  const toAdd = [...wanted].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error } = await database
      .from('meeting_participants')
      .insert(toAdd.map((employee_id) => ({ meeting_id: savedId as string, employee_id })));
    if (error) return databaseFailure(error);
  }
  if (toRemove.length > 0) {
    const { error } = await database
      .from('meeting_participants')
      .delete()
      .eq('meeting_id', savedId as string)
      .in('employee_id', toRemove);
    if (error) return databaseFailure(error);
  }

  revalidatePath('/calendar');
  redirect(`/meetings/${savedId}`);
}

// Content work added straight from a day on the calendar. The database adds the
// category's people and gives each of them a task for it.
export async function addContentWorkAction(values: {
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  endTime: string;
  brief: string;
}): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.contentCalendarManage))) return failure(noPermission);
  const parsed = meetingSchema.safeParse({
    title: values.title,
    agenda: values.brief,
    kind: 'content',
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    location: '',
    meetingLink: '',
    clientId: '',
    projectId: '',
    categoryId: values.categoryId,
    participantIds: [],
  });
  if (!parsed.success) return validationFailure(parsed.error);
  if (!parsed.data.categoryId) return { status: 'error', message: 'Choose a category.', fieldErrors: { categoryId: 'Choose a category.' } };

  const database = await createDatabaseClient();
  const { error } = await database
    .from('meetings')
    .insert({
      title: parsed.data.title,
      agenda: parsed.data.agenda,
      kind: 'content',
      category_id: parsed.data.categoryId,
      starts_at: indiaDateTime(parsed.data.date, parsed.data.startTime),
      ends_at: indiaDateTime(parsed.data.date, parsed.data.endTime),
    })
    .select('id')
    .single();
  if (error) return databaseFailure(error);

  revalidatePath('/calendar');
  revalidatePath('/tasks', 'layout');
  return success('Added. The category’s people have it in their calendar and tasks.');
}

// Content work from a spreadsheet (CSV or Excel), one entry per row. Every row is
// checked first; then all of them are added in one step, so a sheet is never half
// imported. Rows already in the calendar (same category, title, date and time) are
// skipped, so the same sheet can be imported again after adding rows to it.
export async function importContentCalendarAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.contentCalendarManage))) return failure(noPermission);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return failure('Choose a spreadsheet file.');
  if (file.size > 2 * 1024 * 1024) return failure('The file can be up to 2 MB.');

  const rows = await readSpreadsheet(file);
  if (!rows) return failure('Use a CSV or Excel (.xlsx) file. From Google Sheets: File, Download, Microsoft Excel or CSV.');
  const sheet = parseCalendarSheet(rows);
  if (sheet.error) return failure(sheet.error);
  if (sheet.entries.length > 300) return failure('Import up to 300 rows at a time.');

  const database = await createDatabaseClient();
  const { data: categories, error: categoryError } = await database.from('calendar_categories').select('id, name').eq('is_active', true);
  if (categoryError) return databaseFailure(categoryError);
  const categoryIds = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));

  const problems = [...sheet.problems];
  const wanted = sheet.entries.flatMap((entry) => {
    const categoryId = categoryIds.get(entry.category.toLowerCase());
    if (!categoryId) {
      problems.push({ line: entry.line, message: `there is no category called "${entry.category}"` });
      return [];
    }
    return [{ ...entry, categoryId, startsAt: indiaDateTime(entry.date, entry.startTime), endsAt: indiaDateTime(entry.date, entry.endTime) }];
  });
  if (problems.length > 0) {
    const listed = problems
      .sort((first, second) => first.line - second.line)
      .slice(0, 8)
      .map((problem) => `row ${problem.line}: ${problem.message}`);
    return failure(
      `Nothing was imported. Fix ${problems.length === 1 ? 'this row' : `these ${problems.length} rows`} and try again: ${listed.join('; ')}${problems.length > 8 ? '; …' : ''}. Categories in use: ${categories.map((category) => category.name).join(', ')}.`,
    );
  }

  const times = wanted.map((entry) => entry.startsAt).sort();
  const { data: existing, error: existingError } = await database
    .from('meetings')
    .select('title, category_id, starts_at')
    .not('category_id', 'is', null)
    .gte('starts_at', times[0]!)
    .lte('starts_at', times.at(-1)!);
  if (existingError) return databaseFailure(existingError);
  const key = (categoryId: string | null, title: string, startsAt: string) => `${categoryId}|${title.trim().toLowerCase()}|${new Date(startsAt).getTime()}`;
  const seen = new Set(existing.map((meeting) => key(meeting.category_id, meeting.title, meeting.starts_at)));

  const fresh = wanted.filter((entry) => {
    const entryKey = key(entry.categoryId, entry.title, entry.startsAt);
    if (seen.has(entryKey)) return false;
    seen.add(entryKey);
    return true;
  });
  const skipped = wanted.length - fresh.length;
  if (fresh.length === 0) return success(`Everything in this sheet is already in the calendar (${skipped} ${skipped === 1 ? 'row' : 'rows'}).`);

  const { data: added, error } = await database
    .from('meetings')
    .insert(
      fresh.map((entry) => ({
        title: entry.title,
        agenda: entry.brief || null,
        kind: 'content' as const,
        category_id: entry.categoryId,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
      })),
    )
    .select('id');
  if (error) return databaseFailure(error);

  revalidatePath('/calendar');
  revalidatePath('/tasks', 'layout');
  return success(
    `Imported ${added.length} ${added.length === 1 ? 'entry' : 'entries'}. Each category’s people have them in their calendar and tasks.${skipped > 0 ? ` ${skipped} already in the calendar ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}`,
  );
}

export async function saveCalendarCategoryAction(categoryId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.contentCalendarManage))) return failure(noPermission);
  const parsed = calendarCategorySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    memberIds: formData.getAll('memberIds'),
    isActive: categoryId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const row = { name: values.name, description: values.description, is_active: values.isActive };
  const { data, error } = categoryId
    ? await database.from('calendar_categories').update(row).eq('id', categoryId).select('id')
    : await database.from('calendar_categories').insert(row).select('id');
  if (error) return databaseFailure(error, 'A category with this name already exists.');
  if (data.length === 0) return failure(noPermission);
  const id = data[0]!.id;

  // The people it goes to: added and removed to match the form. Entries already in the
  // calendar keep the people they had.
  const { data: current, error: currentError } = await database.from('calendar_category_members').select('employee_id').eq('category_id', id);
  if (currentError) return databaseFailure(currentError);
  const existing = new Set(current.map((member) => member.employee_id));
  const wanted = new Set(values.memberIds);
  const toAdd = [...wanted].filter((person) => !existing.has(person));
  const toRemove = [...existing].filter((person) => !wanted.has(person));
  if (toAdd.length > 0) {
    const { error: addError } = await database.from('calendar_category_members').insert(toAdd.map((employee_id) => ({ category_id: id, employee_id })));
    if (addError) return databaseFailure(addError);
  }
  if (toRemove.length > 0) {
    const { error: removeError } = await database.from('calendar_category_members').delete().eq('category_id', id).in('employee_id', toRemove);
    if (removeError) return databaseFailure(removeError);
  }

  revalidatePath('/settings/calendar');
  return success(categoryId ? 'Category saved.' : 'Category added.');
}

export async function respondToMeetingAction(meetingId: string, response: 'accepted' | 'declined'): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('meeting_participants')
    .update({ response })
    .eq('meeting_id', meetingId)
    .eq('employee_id', access.employee.id)
    .select('meeting_id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('You are not invited to this meeting.');

  revalidatePath(`/meetings/${meetingId}`);
  return success(response === 'accepted' ? 'You are going.' : 'You declined.');
}

export async function setMeetingStatusAction(meetingId: string, status: 'completed' | 'cancelled'): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('meetings').update({ status }).eq('id', meetingId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/calendar');
  return success(status === 'cancelled' ? 'Meeting cancelled. Everyone invited has been told.' : 'Meeting marked as held.');
}

export async function saveMeetingNotesAction(
  meetingId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = meetingNotesSchema.safeParse({
    notes: formData.get('notes') ?? '',
    decisions: formData.get('decisions') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('meetings')
    .update({ notes: parsed.data.notes, decisions: parsed.data.decisions })
    .eq('id', meetingId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/meetings/${meetingId}`);
  return success('Notes saved.');
}
