'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { claimDecisionSchema, claimPaymentSchema, reimbursementSchema } from '@/lib/validation/reimbursementSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshClaims() {
  revalidatePath('/reimbursements', 'layout');
  revalidatePath('/approvals');
  revalidatePath('/finance', 'layout');
}

export async function submitClaimAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.reimbursementsSubmit);
  if (!access) return failure(noPermission);
  const parsed = reimbursementSchema.safeParse({
    categoryId: formData.get('categoryId'),
    description: formData.get('description'),
    expenseDate: formData.get('expenseDate'),
    amount: formData.get('amount') ?? '',
    receiptFileId: formData.get('receiptFileId') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  // The database sets whose claim it is from the signed-in person in any case.
  const { data, error } = await database
    .from('reimbursements')
    .insert({
      employee_id: access.employee.id,
      category_id: values.categoryId,
      description: values.description,
      expense_date: values.expenseDate,
      amount: values.amount,
      receipt_file_id: values.receiptFileId,
    })
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshClaims();
  redirect(`/reimbursements/${data[0]!.id}`);
}

export async function cancelClaimAction(claimId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.reimbursementsSubmit))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('reimbursements').update({ status: 'cancelled' }).eq('id', claimId).eq('status', 'submitted').select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only a claim still waiting for approval can be cancelled.');
  refreshClaims();
  return success('Claim cancelled.');
}

// Reporting managers decide their team's claims whatever their role, so the database
// has the final say on who may decide.
export async function decideClaimAction(claimId: string, approve: boolean, note: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);
  const parsed = claimDecisionSchema.safeParse({ note });
  if (!parsed.success) return validationFailure(parsed.error);
  if (!approve && !parsed.data.note) return failure('Give a reason for rejecting.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('decide_reimbursement', { p_claim: claimId, p_approve: approve, p_note: parsed.data.note });
  if (error) return databaseFailure(error);
  refreshClaims();
  return success(approve ? 'Approved. Finance has been told it is ready to pay.' : 'Rejected. They have been told why.');
}

export async function payClaimAction(claimId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.reimbursementsPay))) return failure(noPermission);
  const parsed = claimPaymentSchema.safeParse({
    paidOn: formData.get('paidOn'),
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
    accountId: formData.get('accountId'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { error } = await database.rpc('pay_reimbursement', {
    p_claim: claimId,
    p_paid_on: values.paidOn,
    p_method: values.method,
    p_reference: values.reference,
    p_account: values.accountId,
  });
  if (error) return databaseFailure(error);

  refreshClaims();
  redirect('/finance/salaries?view=reimbursements');
}
