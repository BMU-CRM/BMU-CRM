'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, isStillInUse, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import {
  appraisalSchema,
  markPayrollPaidSchema,
  parsePtSlabs,
  payrollDecisionSchema,
  payrollLineSchema,
  payrollRuleSchema,
  payrollSettingsSchema,
  salaryComponentSchema,
  salaryStructureSchema,
  startPayrollRunSchema,
} from '@/lib/validation/payrollSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshPayroll(runId?: string) {
  revalidatePath('/hr/payroll', 'layout');
  if (runId) revalidatePath(`/hr/payroll/${runId}`);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function startPayrollRunAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = startPayrollRunSchema.safeParse({ month: formData.get('month') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('start_payroll_run', { p_month: `${parsed.data.month}-01` });
  if (error) return databaseFailure(error, 'There is already a payroll run for this month.');

  refreshPayroll();
  redirect(`/hr/payroll/${data}`);
}

async function runRpc(name: 'recalculate_payroll_run' | 'submit_payroll_run', runId: string, message: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc(name, { p_run: runId });
  if (error) return databaseFailure(error);
  refreshPayroll(runId);
  return success(message);
}

export async function recalculatePayrollRunAction(runId: string) {
  return runRpc('recalculate_payroll_run', runId, 'Payroll worked out again from the latest attendance, leave and salaries.');
}

export async function submitPayrollRunAction(runId: string) {
  return runRpc('submit_payroll_run', runId, 'Sent to Finance for approval.');
}

export async function discardPayrollRunAction(runId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('discard_payroll_run', { p_run: runId });
  if (error) return databaseFailure(error);
  refreshPayroll();
  redirect('/hr/payroll');
}

export async function savePayrollLineAction(runId: string, lineId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = payrollLineSchema.safeParse({
    incentive: formData.get('incentive') ?? '',
    bonus: formData.get('bonus') ?? '',
    overtimeAmount: formData.get('overtimeAmount') ?? '',
    otherEarnings: formData.get('otherEarnings') ?? '',
    otherDeductions: formData.get('otherDeductions') ?? '',
    lopAdjustment: formData.get('lopAdjustment') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { error } = await database.rpc('save_payroll_line', {
    p_line: lineId,
    p_incentive: values.incentive,
    p_bonus: values.bonus,
    p_overtime_amount: values.overtimeAmount,
    p_other_earnings: values.otherEarnings,
    p_other_deductions: values.otherDeductions,
    p_lop_adjustment: values.lopAdjustment,
    p_notes: values.notes,
  });
  if (error) return databaseFailure(error);

  refreshPayroll(runId);
  redirect(`/hr/payroll/${runId}`);
}

export async function decidePayrollRunAction(runId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollApprove))) return failure(noPermission);
  const parsed = payrollDecisionSchema.safeParse({ decision: formData.get('decision'), note: formData.get('note') ?? '' });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('decide_payroll_run', {
    p_run: runId,
    p_approve: parsed.data.decision === 'approve',
    p_note: parsed.data.note,
  });
  if (error) return databaseFailure(error);

  refreshPayroll(runId);
  redirect(`/hr/payroll/${runId}`);
}

export async function markPayrollPaidAction(runId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollApprove))) return failure(noPermission);
  const parsed = markPayrollPaidSchema.safeParse({
    accountId: formData.get('accountId'),
    paidOn: formData.get('paidOn'),
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('mark_payroll_paid', {
    p_run: runId,
    p_paid_on: parsed.data.paidOn,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? '',
    p_account: parsed.data.accountId,
  });
  if (error) return databaseFailure(error);

  refreshPayroll(runId);
  revalidatePath('/finance', 'layout');
  revalidatePath('/payslips');
  redirect(`/hr/payroll/${runId}`);
}

// ---------------------------------------------------------------------------
// Salary structures and appraisals
// ---------------------------------------------------------------------------

export async function addSalaryStructureAction(employeeId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = salaryStructureSchema.safeParse({
    effectiveFrom: formData.get('effectiveFrom'),
    basic: formData.get('basic') ?? '',
    hra: formData.get('hra') ?? '',
    otherAllowances: formData.get('otherAllowances') ?? '',
    specialAllowance: formData.get('specialAllowance') ?? '',
    incentive: formData.get('incentive') ?? '',
    bonus: formData.get('bonus') ?? '',
    pfApplies: formData.get('pfApplies') === 'on',
    esiApplies: formData.get('esiApplies') === 'on',
    ptState: formData.get('ptState') ?? '',
    tdsMonthly: formData.get('tdsMonthly') ?? '',
    revisionReason: formData.get('revisionReason') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('salary_structures')
    .insert({
      employee_id: employeeId,
      effective_from: values.effectiveFrom,
      basic: values.basic,
      hra: values.hra,
      other_allowances: values.otherAllowances,
      special_allowance: values.specialAllowance,
      incentive: values.incentive,
      bonus: values.bonus,
      pf_applies: values.pfApplies,
      esi_applies: values.esiApplies,
      pt_state: values.ptState,
      tds_monthly: values.tdsMonthly,
      revision_reason: values.revisionReason,
    })
    .select('id');
  if (error) return databaseFailure(error, 'This person already has a salary structure from that date.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/hr/payroll', 'layout');
  redirect(`/hr/payroll/structures/${employeeId}`);
}

export async function deleteSalaryStructureAction(employeeId: string, structureId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('salary_structures').delete().eq('id', structureId).select('id');
  if (error) {
    if (isStillInUse(error)) return failure('This structure is already on a payroll run, so it is kept. Add a new one from a later date instead.');
    return databaseFailure(error);
  }
  if (data.length === 0) return failure(noPermission);
  revalidatePath(`/hr/payroll/structures/${employeeId}`);
  return success('Salary structure removed.');
}

export async function saveAppraisalAction(appraisalId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = appraisalSchema.safeParse({
    employeeId: formData.get('employeeId'),
    periodLabel: formData.get('periodLabel'),
    periodStart: formData.get('periodStart'),
    periodEnd: formData.get('periodEnd'),
    rating: formData.get('rating'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    employee_id: values.employeeId,
    period_label: values.periodLabel,
    period_start: values.periodStart,
    period_end: values.periodEnd,
    rating: values.rating,
    notes: values.notes,
  };
  const database = await createDatabaseClient();
  const { data, error } = appraisalId
    ? await database.from('appraisals').update(row).eq('id', appraisalId).select('id')
    : await database.from('appraisals').insert(row).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/hr/payroll', 'layout');
  redirect('/hr/payroll/appraisals');
}

// ---------------------------------------------------------------------------
// Settings: components, rules and defaults
// ---------------------------------------------------------------------------

export async function saveSalaryComponentAction(componentId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = salaryComponentSchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    calculation: formData.get('calculation'),
    amount: formData.get('amount') ?? '',
    percentage: formData.get('percentage') ?? '',
    percentageOf: formData.get('percentageOf') ?? '',
    isTaxable: formData.get('isTaxable') === 'on',
    isActive: componentId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const isFixed = values.calculation === 'fixed';
  const row = {
    name: values.name,
    kind: values.kind,
    calculation: values.calculation,
    amount: isFixed ? values.amount : null,
    percentage: isFixed ? null : values.percentage,
    percentage_of: isFixed ? null : values.percentageOf,
    is_taxable: values.isTaxable,
    is_active: values.isActive,
  };
  const database = await createDatabaseClient();
  const { data, error } = componentId
    ? await database.from('salary_components').update(row).eq('id', componentId).select('id')
    : await database.from('salary_components').insert(row).select('id');
  if (error) return databaseFailure(error, 'A component with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr', 'layout');
  redirect('/settings/hr/payroll');
}

export async function savePayrollRuleAction(ruleId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = payrollRuleSchema.safeParse({
    kind: formData.get('kind'),
    effectiveFrom: formData.get('effectiveFrom'),
    state: formData.get('state') ?? '',
    employeeRate: formData.get('employeeRate') ?? '',
    employerRate: formData.get('employerRate') ?? '',
    wageLimit: formData.get('wageLimit') ?? '',
    slabs: formData.get('slabs') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const isPt = values.kind === 'pt';
  const row = {
    kind: values.kind,
    effective_from: values.effectiveFrom,
    state: isPt ? values.state : null,
    employee_rate: isPt ? null : values.employeeRate,
    employer_rate: values.kind === 'pf' || values.kind === 'esi' ? values.employerRate : null,
    wage_limit: isPt ? null : values.wageLimit,
    slabs: isPt ? parsePtSlabs(values.slabs).slabs : null,
    notes: values.notes,
  };
  const database = await createDatabaseClient();
  const { data, error } = ruleId
    ? await database.from('payroll_rules').update(row).eq('id', ruleId).select('id')
    : await database.from('payroll_rules').insert(row).select('id');
  if (error) return databaseFailure(error, 'There is already a rule of this kind from that date.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr', 'layout');
  revalidatePath('/hr/payroll', 'layout');
  redirect('/settings/hr/payroll');
}

export async function deletePayrollRuleAction(ruleId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('payroll_rules').delete().eq('id', ruleId).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);
  revalidatePath('/settings/hr', 'layout');
  return success('Rule removed. Payroll runs already worked out keep their figures.');
}

export async function savePayrollSettingsAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.payrollManage))) return failure(noPermission);
  const parsed = payrollSettingsSchema.safeParse({
    defaultPtState: formData.get('defaultPtState') ?? '',
    absenceLop: formData.get('absenceLop') === 'on',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('company_settings')
    .update({ default_pt_state: parsed.data.defaultPtState, payroll_absence_lop: parsed.data.absenceLop })
    .eq('id', true)
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('You need HR settings access to change this.');

  revalidatePath('/settings/hr', 'layout');
  return success('Payroll settings saved.');
}
