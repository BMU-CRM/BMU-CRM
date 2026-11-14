'use server';

import { revalidatePath } from 'next/cache';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { financeSettingsSchema } from '@/lib/validation/financeSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';
import { chosenFile, toStoredImage } from '@/server/services/documentImages';

const noPermission = 'You do not have permission to do this.';

export async function saveFinanceSettingsAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.financeManage))) return failure(noPermission);

  const text = (name: string) => formData.get(name) ?? '';
  const parsed = financeSettingsSchema.safeParse({
    legalName: text('legalName'),
    gstin: text('gstin'),
    pan: text('pan'),
    address: text('address'),
    state: text('state'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    invoicePrefix: text('invoicePrefix'),
    receiptPrefix: text('receiptPrefix'),
    poPrefix: text('poPrefix'),
    defaultTaxRate: text('defaultTaxRate'),
    paymentTermsDays: text('paymentTermsDays'),
    quotationValidityDays: text('quotationValidityDays'),
    bankDetails: text('bankDetails'),
    bankAccountName: text('bankAccountName'),
    bankAccountNumber: text('bankAccountNumber'),
    bankIfsc: text('bankIfsc'),
    bankSwift: text('bankSwift'),
    bankName: text('bankName'),
    upiId: text('upiId'),
    invoiceTerms: text('invoiceTerms'),
    quotationTerms: text('quotationTerms'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;

  // The UPI QR code: a new image replaces the saved one; "remove" clears it.
  let upiQr: { upi_qr_image?: string | null } = {};
  const qrFile = chosenFile(formData, 'upiQr');
  if (qrFile) {
    const stored = await toStoredImage(qrFile, { width: 360, height: 360 }, { trim: false });
    if ('error' in stored) return { status: 'error', message: stored.error, fieldErrors: { upiQr: stored.error } };
    upiQr = { upi_qr_image: stored.image };
  } else if (formData.get('removeUpiQr') === 'on') {
    upiQr = { upi_qr_image: null };
  }

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('finance_settings')
    .update({
      legal_name: values.legalName,
      gstin: values.gstin,
      pan: values.pan,
      address: values.address,
      state: values.state,
      email: values.email,
      phone: values.phone,
      website: values.website,
      invoice_prefix: values.invoicePrefix,
      receipt_prefix: values.receiptPrefix,
      po_prefix: values.poPrefix,
      default_tax_rate: values.defaultTaxRate,
      payment_terms_days: values.paymentTermsDays,
      quotation_validity_days: values.quotationValidityDays,
      bank_details: values.bankDetails,
      bank_account_name: values.bankAccountName,
      bank_account_number: values.bankAccountNumber,
      bank_ifsc: values.bankIfsc,
      bank_swift: values.bankSwift,
      bank_name: values.bankName,
      upi_id: values.upiId,
      ...upiQr,
      invoice_terms: values.invoiceTerms,
      quotation_terms: values.quotationTerms,
    })
    .eq('id', true)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/finance');
  return success('Finance settings saved.');
}
