'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import {
  exitChecklistItemSchema,
  exitInterviewSchema,
  noticePeriodSchema,
  resignationDecisionSchema,
  resignationSchema,
  settlementPaymentSchema,
  settlementSchema,
} from '@/lib/validation/exitSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshExit(resignationId?: string) {
  revalidatePath('/hr/exits', 'layout');
  revalidatePath('/resignation');
  if (resignationId) revalidatePath(`/hr/exits/${resignationId}`);
}

export async function submitResignationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.resignationSubmit);
  if (!access) return failure(noPermission);
  const parsed = resignationSchema.safeParse({ reason: formData.get('reason'), proposedLastDay: formData.get('proposedLastDay') ?? '' });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  // The database records it as the signed-in person's, whatever is sent.
  const { error } = await database
    .from('resignations')
    .insert({ employee_id: access.employee.id, reason: parsed.data.reason, proposed_last_day: parsed.data.proposedLastDay });
  if (error) return databaseFailure(error);

  refreshExit();
  return success('Your resignation has been sent to HR.');
}

export async function withdrawResignationAction(resignationId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.resignationSubmit))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('resignations').update({ status: 'withdrawn' }).eq('id', resignationId).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);
  refreshExit(resignationId);
  return success('Resignation withdrawn.');
}

export async function decideResignationAction(resignationId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const parsed = resignationDecisionSchema.safeParse({
    decision: formData.get('decision'),
    lastWorkingDay: formData.get('lastWorkingDay') ?? '',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('decide_resignation', {
    p_resignation: resignationId,
    p_approve: parsed.data.decision === 'approve',
    p_last_day: parsed.data.lastWorkingDay as string,
    p_note: parsed.data.note,
  });
  if (error) return databaseFailure(error);

  refreshExit(resignationId);
  revalidatePath('/people', 'layout');
  redirect(`/hr/exits/${resignationId}`);
}

export async function saveExitInterviewAction(resignationId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const parsed = exitInterviewSchema.safeParse({ interviewAt: formData.get('interviewAt') ?? '', notes: formData.get('notes') ?? '' });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('resignations')
    .update({
      exit_interview_at: parsed.data.interviewAt ? `${parsed.data.interviewAt}:00+05:30` : null,
      exit_interview_notes: parsed.data.notes,
    })
    .eq('id', resignationId)
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshExit(resignationId);
  return success('Exit interview saved.');
}

export async function setExitTaskAction(resignationId: string, taskId: string, done: boolean): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('set_exit_task', { p_task: taskId, p_done: done, p_note: '' });
  if (error) return databaseFailure(error);
  refreshExit(resignationId);
  return success(done ? 'Marked done.' : 'Marked not done.');
}

export async function saveSettlementAction(resignationId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const parsed = settlementSchema.safeParse({
    pendingSalary: formData.get('pendingSalary') ?? '',
    leaveEncashmentDays: formData.get('leaveEncashmentDays') ?? '',
    leaveEncashmentAmount: formData.get('leaveEncashmentAmount') ?? '',
    reimbursementsDue: formData.get('reimbursementsDue') ?? '',
    otherEarnings: formData.get('otherEarnings') ?? '',
    noticeRecovery: formData.get('noticeRecovery') ?? '',
    otherDeductions: formData.get('otherDeductions') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('final_settlements')
    .update({
      pending_salary: values.pendingSalary,
      leave_encashment_days: values.leaveEncashmentDays,
      leave_encashment_amount: values.leaveEncashmentAmount,
      reimbursements_due: values.reimbursementsDue,
      other_earnings: values.otherEarnings,
      notice_recovery: values.noticeRecovery,
      other_deductions: values.otherDeductions,
      notes: values.notes,
    })
    .eq('resignation_id', resignationId)
    .select('resignation_id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshExit(resignationId);
  redirect(`/hr/exits/${resignationId}`);
}

export async function markSettlementPaidAction(resignationId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollApprove))) return failure(noPermission);
  const parsed = settlementPaymentSchema.safeParse({
    accountId: formData.get('accountId'),
    paidOn: formData.get('paidOn'),
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('mark_settlement_paid', {
    p_resignation: resignationId,
    p_paid_on: parsed.data.paidOn,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? '',
    p_account: parsed.data.accountId,
  });
  if (error) return databaseFailure(error);

  refreshExit(resignationId);
  redirect(`/hr/exits/${resignationId}`);
}

export async function saveExitChecklistItemAction(itemId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const parsed = exitChecklistItemSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || 'other',
    isActive: itemId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, category: parsed.data.category, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = itemId
    ? await database.from('exit_checklist_items').update(row).eq('id', itemId).select('id')
    : await database.from('exit_checklist_items').insert(row).select('id');
  if (error) return databaseFailure(error, 'There is already an item with this name.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr', 'layout');
  return success(itemId ? 'Item saved.' : 'Item added.');
}

export async function saveNoticePeriodAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.exitsManage))) return failure(noPermission);
  const parsed = noticePeriodSchema.safeParse({ noticePeriodDays: formData.get('noticePeriodDays') ?? '' });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('company_settings')
    .update({ notice_period_days: parsed.data.noticePeriodDays })
    .eq('id', true)
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('You need HR settings access to change this.');

  revalidatePath('/settings/hr', 'layout');
  return success('Notice period saved.');
}
