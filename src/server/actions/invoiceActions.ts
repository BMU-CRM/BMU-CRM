'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import {
  cancelReasonSchema,
  documentForDatabase,
  itemsForDatabase,
  parseLineItems,
  paymentSchema,
  readFinanceDocument,
} from '@/lib/validation/financeSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshInvoice(invoiceId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath('/invoices');
}

// Saves the form: a new invoice is created as a draft, an existing one updated. The
// id comes from the page, or from the form once autosave has created the draft.
async function saveInvoice(boundId: string | null, formData: FormData): Promise<{ id: string } | ActionResult> {
  if (!(await getActionAccess(permissionKeys.invoicesManage))) return failure(noPermission);
  const savedId = z.uuid().safeParse(formData.get('documentId'));
  const invoiceId = boundId ?? (savedId.success ? savedId.data : null);

  const parsed = readFinanceDocument(formData);
  if (!parsed.success) return validationFailure(parsed.error);
  const lines = parseLineItems(formData);
  if (!lines.ok) return { status: 'error', message: lines.message, fieldErrors: { items: lines.message } };

  // The database works out every amount from the items, and checks who may do this.
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('save_invoice', {
    p_invoice: invoiceId as string,
    p_values: documentForDatabase(parsed.data, 'due_date'),
    p_items: itemsForDatabase(lines.items),
  });
  if (error) return databaseFailure(error);
  return { id: data };
}

export async function saveInvoiceAction(
  invoiceId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const saved = await saveInvoice(invoiceId, formData);
  if (!('id' in saved)) return saved;
  refreshInvoice(saved.id);
  redirect(`/invoices/${saved.id}`);
}

// Saves the draft while it is being written, without leaving the page. Returns the id,
// so later saves update the same draft.
export async function autosaveInvoiceAction(invoiceId: string | null, formData: FormData): Promise<{ id: string } | ActionResult> {
  return saveInvoice(invoiceId, formData);
}

// Issuing gives the invoice its number and locks it.
export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .update({ status: 'issued' })
    .eq('id', invoiceId)
    .select('invoice_number');

  if (error) return databaseFailure(error);
  const [issued] = data;
  if (!issued) return failure(noPermission);

  refreshInvoice(invoiceId);
  return success(`Issued as ${issued.invoice_number}. It can no longer be changed.`);
}

export async function cancelInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult> {
  const parsed = cancelReasonSchema.safeParse(reason);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Give a reason for cancelling.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .update({ status: 'cancelled', cancel_reason: parsed.data })
    .eq('id', invoiceId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshInvoice(invoiceId);
  return success('Invoice cancelled. Its number stays used, as GST requires.');
}

export async function deleteInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('invoices').delete().eq('id', invoiceId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only a draft invoice can be deleted.');

  revalidatePath('/invoices');
  redirect('/invoices');
}

export async function recordPaymentAction(invoiceId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.paymentsRecord))) return failure(noPermission);

  const parsed = paymentSchema.safeParse({
    amount: formData.get('amount') ?? '',
    paymentDate: formData.get('paymentDate') ?? '',
    method: formData.get('method') ?? '',
    reference: formData.get('reference') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  // The database checks the invoice can take this payment, and updates its status.
  const database = await createDatabaseClient();
  const { error } = await database.from('payments').insert({
    invoice_id: invoiceId,
    amount: parsed.data.amount,
    payment_date: parsed.data.paymentDate,
    method: parsed.data.method,
    reference: parsed.data.reference,
    notes: parsed.data.notes,
  });
  if (error) return databaseFailure(error);

  refreshInvoice(invoiceId);
  return success('Payment recorded.');
}

export async function removePaymentAction(invoiceId: string, paymentId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.paymentsRecord))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('payments').delete().eq('id', paymentId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshInvoice(invoiceId);
  return success('Payment removed.');
}
