import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';

export type QuotationStatus = Database['public']['Enums']['quotation_status'];
export type InvoiceStatus = Database['public']['Enums']['invoice_status'];
export type PaymentMethod = Database['public']['Enums']['payment_method'];

export const quotationStatusLabels: Record<QuotationStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Part paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
  card: 'Card',
  tds: 'TDS deducted by the client',
  other: 'Other',
};

// The GST rates in use since September 2025. Any rate from 0 to 40 is accepted.
export const standardTaxRates = [0, 5, 18, 40];

export const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value));

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid('Choose a valid option.').nullable());

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.iso.date('Enter a valid date.').nullable());

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.string().regex(gstinPattern, 'Enter a valid 15-character GSTIN.').nullable());

// Accepts "1,50,000.50" as well as "150000.5", with at most two decimal places.
const decimal = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replaceAll(',', ''))
    .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, message))
    .transform(Number);

export const financeDocumentSchema = z
  .object({
    clientId: z.uuid('Choose a client.'),
    projectId: optionalId,
    title: z.string().trim().min(2, 'Enter what this is for.').max(200, 'Use 200 characters or fewer.'),
    issueDate: z.iso.date('Enter a valid date.'),
    endDate: optionalDate,
    billToName: optionalText(160),
    billToAddress: optionalText(500),
    clientGstin: gstin,
    placeOfSupply: optionalText(60),
    notes: optionalText(2000),
    terms: optionalText(2000),
  })
  .refine((values) => !values.endDate || values.endDate >= values.issueDate, {
    path: ['endDate'],
    message: 'This must be on or after the date of the document.',
  });

export type FinanceDocumentValues = z.infer<typeof financeDocumentSchema>;

// Quotations and invoices share one form. Its last date is "valid until" on a
// quotation and the due date on an invoice.
export function readFinanceDocument(formData: FormData) {
  const text = (name: string) => formData.get(name) ?? '';
  return financeDocumentSchema.safeParse({
    clientId: text('clientId'),
    projectId: text('projectId'),
    title: text('title'),
    issueDate: text('issueDate'),
    endDate: text('endDate'),
    billToName: text('billToName'),
    billToAddress: text('billToAddress'),
    clientGstin: text('clientGstin'),
    placeOfSupply: text('placeOfSupply'),
    notes: text('notes'),
    terms: text('terms'),
  });
}

// Empty bill-to details and dates are filled in by the database from the client and
// the finance settings.
export function documentForDatabase(values: FinanceDocumentValues, endDateColumn: 'valid_until' | 'due_date') {
  return {
    client_id: values.clientId,
    project_id: values.projectId,
    title: values.title,
    issue_date: values.issueDate,
    [endDateColumn]: values.endDate,
    bill_to_name: values.billToName,
    bill_to_address: values.billToAddress,
    client_gstin: values.clientGstin,
    place_of_supply: values.placeOfSupply,
    notes: values.notes,
    terms: values.terms,
  };
}

const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Describe the item.').max(500, 'Use 500 characters or fewer.'),
  hsnSac: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4,8}$/.test(value), 'Use a 4 to 8 digit HSN or SAC code.'),
  quantity: decimal('Enter a quantity, with up to two decimal places.')
    .refine((value) => value > 0, 'Enter a quantity above zero.')
    .refine((value) => value < 10_000_000_000, 'Use a smaller quantity.'),
  unitPrice: decimal('Enter a rate in rupees, with up to two decimal places.'),
  taxRate: decimal('Choose a GST rate.').refine((value) => value <= 40, 'GST cannot be above 40%.'),
});

export type LineItem = z.infer<typeof lineItemSchema>;

type LineItemsResult = { ok: true; items: LineItem[] } | { ok: false; message: string };

// Reads the repeated item fields from the form. Rows left completely empty are skipped.
export function parseLineItems(formData: FormData): LineItemsResult {
  const read = (name: string) => formData.getAll(name).map((value) => String(value));
  const descriptions = read('itemDescription');
  const codes = read('itemHsnSac');
  const quantities = read('itemQuantity');
  const prices = read('itemUnitPrice');
  const rates = read('itemTaxRate');

  const items: LineItem[] = [];
  for (const [index, description] of descriptions.entries()) {
    const raw = {
      description,
      hsnSac: codes[index] ?? '',
      quantity: quantities[index] ?? '',
      unitPrice: prices[index] ?? '',
      taxRate: rates[index] ?? '',
    };
    if (!raw.description.trim() && !raw.hsnSac.trim() && !raw.unitPrice.trim()) continue;

    const parsed = lineItemSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: `Item ${index + 1}: ${parsed.error.issues[0]?.message ?? 'Check this item.'}` };
    items.push(parsed.data);
  }

  if (items.length === 0) return { ok: false, message: 'Add at least one item.' };
  if (items.length > 100) return { ok: false, message: 'Use 100 items or fewer.' };
  return { ok: true, items };
}

export function itemsForDatabase(items: LineItem[]) {
  return items.map((item) => ({
    description: item.description,
    hsn_sac: item.hsnSac,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    tax_rate: item.taxRate,
  }));
}

export const paymentSchema = z.object({
  amount: decimal('Enter the amount in rupees, with up to two decimal places.').refine((value) => value > 0, 'Enter an amount above zero.'),
  paymentDate: z.iso.date('Enter a valid date.'),
  method: z.enum(['bank_transfer', 'upi', 'cheque', 'cash', 'card', 'tds', 'other'], { error: 'Choose how it was paid.' }),
  reference: optionalText(120),
  notes: optionalText(500),
});

export const cancelReasonSchema = z
  .string()
  .trim()
  .min(3, 'Give a reason for cancelling.')
  .max(500, 'Use 500 characters or fewer.');

export const financeSettingsSchema = z.object({
  legalName: optionalText(160),
  gstin,
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN.').nullable()),
  address: optionalText(500),
  state: optionalText(60),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.email('Enter a valid email address.').nullable()),
  phone: optionalText(30),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, 'Use 1 to 5 letters or digits.'),
  receiptPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, 'Use 1 to 5 letters or digits.'),
  poPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, 'Use 1 to 5 letters or digits.'),
  defaultTaxRate: decimal('Enter a rate such as 18.').refine((value) => value <= 40, 'GST cannot be above 40%.'),
  paymentTermsDays: z.coerce.number({ error: 'Enter a number of days.' }).int('Enter whole days.').min(0, 'Use 0 or more days.').max(365, 'Use 365 days or fewer.'),
  quotationValidityDays: z.coerce.number({ error: 'Enter a number of days.' }).int('Enter whole days.').min(1, 'Use at least 1 day.').max(365, 'Use 365 days or fewer.'),
  bankDetails: optionalText(1000),
  invoiceTerms: optionalText(2000),
  quotationTerms: optionalText(2000),
});
