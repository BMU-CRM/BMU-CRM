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
  documentForDatabase,
  itemsForDatabase,
  parseLineItems,
  readFinanceDocument,
  type QuotationStatus,
} from '@/lib/validation/financeSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshQuotation(quotationId: string) {
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath('/quotations');
}

// Saves the form: a new quotation is created as a draft, an existing one updated. The
// id comes from the page, or from the form once autosave has created the draft.
async function saveQuotation(boundId: string | null, formData: FormData): Promise<{ id: string } | ActionResult> {
  if (!(await getActionAccess(permissionKeys.quotationsManage))) return failure(noPermission);
  const savedId = z.uuid().safeParse(formData.get('documentId'));
  const quotationId = boundId ?? (savedId.success ? savedId.data : null);

  const parsed = readFinanceDocument(formData);
  if (!parsed.success) return validationFailure(parsed.error);
  const lines = parseLineItems(formData);
  if (!lines.ok) return { status: 'error', message: lines.message, fieldErrors: { items: lines.message } };

  // The database works out every amount from the items, and checks who may do this.
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('save_quotation', {
    p_quotation: quotationId as string,
    p_values: documentForDatabase(parsed.data, 'valid_until'),
    p_items: itemsForDatabase(lines.items),
  });
  if (error) return databaseFailure(error);

  // The project overview is saved beside the rest, while it is a draft.
  const { error: overviewError } = await database.from('quotations').update({ overview: parsed.data.overview }).eq('id', data).select('id');
  if (overviewError) return databaseFailure(overviewError);
  return { id: data };
}

export async function saveQuotationAction(
  quotationId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const saved = await saveQuotation(quotationId, formData);
  if (!('id' in saved)) return saved;
  refreshQuotation(saved.id);
  redirect(`/quotations/${saved.id}`);
}

// Saves the draft while it is being written, without leaving the page. Returns the id,
// so later saves update the same draft.
export async function autosaveQuotationAction(quotationId: string | null, formData: FormData): Promise<{ id: string } | ActionResult> {
  return saveQuotation(quotationId, formData);
}

const statusMessages: Record<QuotationStatus, string> = {
  draft: 'Back to draft. You can change it now.',
  final: 'Finalised. The printed copy no longer says draft, and it is locked.',
  sent: 'Marked as sent to the client.',
  accepted: 'Marked as accepted. You can now turn it into an invoice.',
  declined: 'Marked as declined.',
};

export async function changeQuotationStatusAction(quotationId: string, status: QuotationStatus): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('quotations').update({ status }).eq('id', quotationId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshQuotation(quotationId);
  return success(statusMessages[status]);
}

export async function createInvoiceFromQuotationAction(quotationId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.invoicesManage))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('create_invoice_from_quotation', { p_quotation: quotationId });
  if (error) return databaseFailure(error);

  refreshQuotation(quotationId);
  revalidatePath('/invoices');
  redirect(`/invoices/${data}`);
}

export async function deleteQuotationAction(quotationId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('quotations').delete().eq('id', quotationId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only a draft quotation can be deleted.');

  revalidatePath('/quotations');
  redirect('/quotations');
}
