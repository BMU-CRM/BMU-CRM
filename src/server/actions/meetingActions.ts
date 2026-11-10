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
import { createDatabaseClient } from '@/server/database/databaseClient';
import { meetingNotesSchema, meetingSchema } from '@/lib/validation/meetingSchema';
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
    participantIds: formData.getAll('participantIds'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
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
  // people are taken off. Existing answers are kept.
  const wanted = new Set(values.participantIds.filter((id) => id !== access.employee.id));
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
