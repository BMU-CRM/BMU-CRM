'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { budgetSchema } from '@/lib/validation/budgetSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function saveBudgetAction(budgetId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.budgetsManage))) return failure(noPermission);
  const parsed = budgetSchema.safeParse({
    departmentId: formData.get('departmentId') ?? '',
    periodKind: formData.get('periodKind') ?? '',
    month: formData.get('month') ?? '',
    yearStart: formData.get('yearStart') ?? '',
    amount: formData.get('amount') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = { department_id: values.departmentId, period_kind: values.periodKind, period_start: values.periodStart, amount: values.amount, notes: values.notes };
  const database = await createDatabaseClient();
  const { data, error } = budgetId
    ? await database.from('department_budgets').update(row).eq('id', budgetId).select('id')
    : await database.from('department_budgets').insert(row).select('id');
  if (error) return databaseFailure(error, 'This department already has a budget for that period.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/finance/budgets');
  redirect(`/finance/budgets?kind=${values.periodKind}`);
}

export async function deleteBudgetAction(budgetId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.budgetsManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('department_budgets').delete().eq('id', budgetId).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);
  revalidatePath('/finance/budgets');
  return success('Budget deleted. Spending is not affected.');
}
