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
    invoicePrefix: text('invoicePrefix'),
    defaultTaxRate: text('defaultTaxRate'),
    paymentTermsDays: text('paymentTermsDays'),
    quotationValidityDays: text('quotationValidityDays'),
    bankDetails: text('bankDetails'),
    invoiceTerms: text('invoiceTerms'),
    quotationTerms: text('quotationTerms'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
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
      invoice_prefix: values.invoicePrefix,
      default_tax_rate: values.defaultTaxRate,
      payment_terms_days: values.paymentTermsDays,
      quotation_validity_days: values.quotationValidityDays,
      bank_details: values.bankDetails,
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
