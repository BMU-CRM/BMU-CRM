'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const sendSchema = z.object({
  period: z.enum(['day', 'week'], 'Choose a day or a week.'),
  date: z.iso.date('Choose a date.'),
  note: z.string().trim().max(1000, 'Keep the note to 1000 characters.'),
});

// Sends the day or week shown to those who receive workload reports. The database keeps
// the figures as they are now and notifies them.
export async function sendWorkloadReportAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.workloadReportSend))) return failure('You cannot send workload reports.');

  const parsed = sendSchema.safeParse({
    period: formData.get('period'),
    date: formData.get('date'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('send_workload_report', {
    p_period: parsed.data.period,
    p_date: parsed.data.date,
    p_note: parsed.data.note,
  });
  if (error) return databaseFailure(error);
  if (!data) return failure('The report was not sent. Try again.');

  revalidatePath('/workload/reports');
  return success('Report sent.');
}

// Marks a red flag "Looked into" with a comment. An empty comment opens it again.
export async function saveWorkloadFlagNoteAction(flagKey: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.workloadReportSend))) return failure('You cannot comment on red flags.');
  const note = String(formData.get('note') ?? '').trim();
  if (note.length === 1) return failure('Write a few words.');
  if (note.length > 1000) return failure('Keep the comment to 1000 characters.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('set_workload_flag_note', { p_flag_key: flagKey, p_note: note });
  if (error) return databaseFailure(error);

  revalidatePath('/workload/flags');
  return success(note ? 'Marked as looked into.' : 'Opened again.');
}

// The Founder marks a report Reviewed, with an optional reply. The sender is told.
export async function reviewWorkloadReportAction(reportId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.workloadReportReceive))) return failure('You cannot review workload reports.');
  const reply = String(formData.get('reply') ?? '').trim();
  if (reply.length > 1000) return failure('Keep the reply to 1000 characters.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('review_workload_report', { p_report: reportId, p_reply: reply });
  if (error) return databaseFailure(error);

  revalidatePath('/workload/reports');
  revalidatePath(`/workload/reports/${reportId}`);
  return success('Marked as reviewed. The sender is told.');
}

const days = (label: string, max: number) =>
  z.coerce.number({ error: `Enter ${label}.` }).int('Enter a whole number.').min(1, `Enter 1 to ${max}.`).max(max, `Enter 1 to ${max}.`);

const flagSettingsSchema = z.object({
  overdueDays: days('the days overdue', 60),
  reworkTimes: days('how many times', 20),
  reviewWaitDays: days('the days waiting', 60),
  idleWorkingDays: days('the working days', 30),
  checkAttendance: z.boolean(),
});

export async function saveWorkloadFlagSettingsAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.workloadFlagsManage))) return failure('You cannot change the red flag limits.');
  const parsed = flagSettingsSchema.safeParse({
    overdueDays: formData.get('overdueDays'),
    reworkTimes: formData.get('reworkTimes'),
    reviewWaitDays: formData.get('reviewWaitDays'),
    idleWorkingDays: formData.get('idleWorkingDays'),
    checkAttendance: formData.get('checkAttendance') === 'on',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('workload_flag_settings')
    .update({
      overdue_days: parsed.data.overdueDays,
      rework_times: parsed.data.reworkTimes,
      review_wait_days: parsed.data.reviewWaitDays,
      idle_working_days: parsed.data.idleWorkingDays,
      check_attendance: parsed.data.checkAttendance,
    })
    .eq('id', true)
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('You cannot change the red flag limits.');

  revalidatePath('/workload/flags');
  return success('Limits saved.');
}
