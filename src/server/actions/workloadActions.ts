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
