'use server';

import { revalidatePath } from 'next/cache';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { followUpSchema } from '@/lib/validation/followUpSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

export async function recordFollowUpAction(invoiceId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.followupsManage))) return failure('You do not have permission to do this.');
  const parsed = followUpSchema.safeParse({
    status: formData.get('status'),
    note: formData.get('note'),
    contactedOn: formData.get('contactedOn'),
    nextFollowUpOn: formData.get('nextFollowUpOn') ?? '',
    promisedOn: formData.get('promisedOn') ?? '',
    promisedAmount: formData.get('promisedAmount') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const promise = values.status === 'promise_to_pay';
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoice_follow_ups')
    .insert({
      invoice_id: invoiceId,
      status: values.status,
      note: values.note,
      contacted_on: values.contactedOn,
      next_follow_up_on: values.nextFollowUpOn,
      promised_on: promise ? values.promisedOn : null,
      promised_amount: promise ? values.promisedAmount : null,
    })
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('You do not have permission to do this.');

  revalidatePath(`/finance/follow-ups/${invoiceId}`);
  revalidatePath('/finance/follow-ups');
  return success('Follow-up recorded.');
}
