'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseStatementCsv } from '@/lib/finance/parseStatementCsv';
import { bankAccountSchema, expenseSchema, financeCategorySchema, incomeSchema, removalSchema } from '@/lib/validation/ledgerSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { encryptField, isEncryptionReady } from '@/server/security/fieldEncryption';
import { getActionAccess } from '@/server/services/accessService';
import type { Database } from '@/types/databaseTypes';

const noPermission = 'You do not have permission to do this.';

function refreshLedger() {
  revalidatePath('/finance', 'layout');
}

export async function saveExpenseAction(expenseId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return failure(noPermission);
  const parsed = expenseSchema.safeParse({
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount') ?? '',
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
    notes: formData.get('notes') ?? '',
    bankAccountId: formData.get('bankAccountId'),
    spentOn: formData.get('spentOn'),
    departmentId: formData.get('departmentId') ?? '',
    vendorName: formData.get('vendorName') ?? '',
    receiptFileId: formData.get('receiptFileId') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    category_id: values.categoryId,
    amount: values.amount,
    method: values.method,
    reference: values.reference,
    notes: values.notes,
    bank_account_id: values.bankAccountId,
    spent_on: values.spentOn,
    department_id: values.departmentId,
    vendor_name: values.vendorName,
    receipt_file_id: values.receiptFileId,
  };
  const database = await createDatabaseClient();
  const { data, error } = expenseId
    ? await database.from('expense_records').update(row).eq('id', expenseId).select('id')
    : await database.from('expense_records').insert(row).select('id');
  if (error) return databaseFailure(error, 'An entry with this reference already exists for this account.');
  if (data.length === 0) return failure(noPermission);

  refreshLedger();
  redirect('/finance/ledger?view=expenses');
}

export async function saveIncomeAction(incomeId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return failure(noPermission);
  const parsed = incomeSchema.safeParse({
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount') ?? '',
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
    notes: formData.get('notes') ?? '',
    bankAccountId: formData.get('bankAccountId'),
    receivedOn: formData.get('receivedOn'),
    clientId: formData.get('clientId') ?? '',
    fileId: formData.get('fileId') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    category_id: values.categoryId,
    amount: values.amount,
    method: values.method,
    reference: values.reference,
    notes: values.notes,
    bank_account_id: values.bankAccountId,
    received_on: values.receivedOn,
    client_id: values.clientId,
    file_id: values.fileId,
  };
  const database = await createDatabaseClient();
  const { data, error } = incomeId
    ? await database.from('income_records').update(row).eq('id', incomeId).select('id')
    : await database.from('income_records').insert(row).select('id');
  if (error) return databaseFailure(error, 'An entry with this reference already exists for this account.');
  if (data.length === 0) return failure(noPermission);

  refreshLedger();
  redirect('/finance/ledger?view=income');
}

export async function removeLedgerEntryAction(kind: 'income' | 'expense', id: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return failure(noPermission);
  const parsed = removalSchema.safeParse({ reason: formData.get('reason') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('remove_ledger_entry', { p_kind: kind, p_id: id, p_reason: parsed.data.reason });
  if (error) return databaseFailure(error);

  refreshLedger();
  redirect(`/finance/ledger?view=${kind === 'income' ? 'income' : 'expenses'}`);
}

export async function saveBankAccountAction(accountId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.banksManage))) return failure(noPermission);
  const parsed = bankAccountSchema.safeParse({
    name: formData.get('name'),
    accountType: formData.get('accountType'),
    bankName: formData.get('bankName') ?? '',
    accountHolder: formData.get('accountHolder') ?? '',
    accountNumber: formData.get('accountNumber') ?? '',
    ifsc: formData.get('ifsc') ?? '',
    openingBalance: formData.get('openingBalance') ?? '',
    openingDate: formData.get('openingDate'),
    isPrimary: formData.get('isPrimary') === 'on',
    isActive: accountId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  if (values.accountNumber && !isEncryptionReady()) {
    return failure('Account numbers cannot be saved until encryption is set up. Ask the administrator to add FIELD_ENCRYPTION_KEY.');
  }

  const row: Database['public']['Tables']['bank_accounts']['Insert'] = {
    name: values.name,
    account_type: values.accountType,
    bank_name: values.bankName,
    account_holder: values.accountHolder,
    ifsc: values.ifsc,
    opening_balance: values.openingBalance,
    opening_date: values.openingDate,
    is_primary: values.isPrimary,
    is_active: values.isActive,
  };
  if (values.accountNumber) {
    row.account_number_encrypted = encryptField(values.accountNumber);
    row.account_last4 = values.accountNumber.slice(-4);
  }

  const database = await createDatabaseClient();
  // Only one account is primary: the old one steps down first.
  if (values.isPrimary) {
    await database.from('bank_accounts').update({ is_primary: false }).eq('is_primary', true).neq('id', accountId ?? '00000000-0000-0000-0000-000000000000').select('id');
  }
  const { data, error } = accountId
    ? await database.from('bank_accounts').update(row).eq('id', accountId).select('id')
    : await database.from('bank_accounts').insert(row).select('id');
  if (error) return databaseFailure(error, 'An account with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refreshLedger();
  redirect(`/finance/banks/${data[0]!.id}`);
}

export async function importStatementAction(accountId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.banksManage))) return failure(noPermission);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return failure('Choose a CSV file.');
  if (file.size > 5 * 1024 * 1024) return failure('The file can be up to 5 MB.');

  const { rows, error: parseError, skipped } = parseStatementCsv(await file.text());
  if (parseError) return failure(parseError);

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('import_statement_lines', { p_account: accountId, p_rows: rows });
  if (error) return databaseFailure(error);

  const result = data as { imported: number; skipped: number; errors: { line: number; error: string }[] };
  revalidatePath(`/finance/banks/${accountId}`);
  const notes = [
    result.skipped > 0 ? `${result.skipped} already imported` : null,
    skipped > 0 ? `${skipped} without a date or amount` : null,
    result.errors.length > 0 ? `${result.errors.length} could not be read` : null,
  ].filter(Boolean);
  return success(`Imported ${result.imported} lines.${notes.length ? ` Skipped: ${notes.join(', ')}.` : ''}`);
}

export async function matchStatementLineAction(accountId: string, lineId: string, kind: string, movementId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.banksManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('match_statement_line', { p_line: lineId, p_kind: kind, p_id: movementId });
  if (error) return databaseFailure(error);
  revalidatePath(`/finance/banks/${accountId}`);
  return success('Matched.');
}

export async function unmatchStatementLineAction(accountId: string, lineId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.banksManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('unmatch_statement_line', { p_line: lineId });
  if (error) return databaseFailure(error);
  revalidatePath(`/finance/banks/${accountId}`);
  return success('Unmatched.');
}

export async function saveFinanceCategoryAction(categoryId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return failure(noPermission);
  const parsed = financeCategorySchema.safeParse({
    kind: formData.get('kind'),
    name: formData.get('name'),
    isActive: categoryId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = categoryId
    ? await database.from('finance_categories').update({ name: parsed.data.name, is_active: parsed.data.isActive }).eq('id', categoryId).select('id')
    : await database.from('finance_categories').insert({ kind: parsed.data.kind, name: parsed.data.name }).select('id');
  if (error) return databaseFailure(error, 'A category with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/finance', 'layout');
  return success(categoryId ? 'Category saved.' : 'Category added.');
}
