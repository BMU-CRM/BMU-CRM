import { z } from 'zod';
import { paymentMethods } from './payrollSchema';

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

const positiveAmount = z
  .string()
  .trim()
  .transform((value) => Number(value.replaceAll(',', '')))
  .pipe(z.number({ error: 'Enter an amount.' }).gt(0, 'Enter more than zero.').max(99_99_99_999, 'That amount is too large.'))
  .transform((value) => Math.round(value * 100) / 100);

const shared = {
  categoryId: z.uuid('Choose a category.'),
  amount: positiveAmount,
  method: z.enum(paymentMethods, { error: 'Choose how it was paid.' }),
  reference: optionalText(120),
  notes: optionalText(1000),
  bankAccountId: z.uuid('Choose the account.'),
};

export const incomeSchema = z.object({
  ...shared,
  receivedOn: z.iso.date('Enter the date.'),
  clientId: optionalId,
  fileId: optionalId,
});

export const expenseSchema = z.object({
  ...shared,
  spentOn: z.iso.date('Enter the date.'),
  departmentId: optionalId,
  vendorName: optionalText(160),
  receiptFileId: optionalId,
});

export const removalSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason.').max(500, 'Use 500 characters or fewer.'),
});

export const bankAccountTypes = ['current', 'savings', 'cash', 'other'] as const;
export const bankAccountTypeLabels: Record<string, string> = { current: 'Current account', savings: 'Savings account', cash: 'Cash', other: 'Other' };

export const bankAccountSchema = z.object({
  name: z.string().trim().min(2, 'Name the account.').max(80),
  accountType: z.enum(bankAccountTypes),
  bankName: optionalText(120),
  accountHolder: optionalText(120),
  accountNumber: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\d{6,18})?$/, 'Enter 6 to 18 digits.')),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, 'Enter an IFSC such as HDFC0001234.'))
    .transform((value) => (value === '' ? null : value)),
  openingBalance: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 0 : Number(value.replaceAll(',', ''))))
    .pipe(z.number({ error: 'Enter an amount.' }).min(-99_99_99_999).max(99_99_99_999)),
  openingDate: z.iso.date('Enter the date of the opening balance.'),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

export const financeCategorySchema = z.object({
  kind: z.enum(['income', 'expense']),
  name: z.string().trim().min(2, 'Enter a name.').max(80),
  isActive: z.boolean(),
});

export const movementKindLabels: Record<string, string> = {
  invoice_payment: 'Invoice payment',
  income: 'Other income',
  expense: 'Expense',
  payroll: 'Salaries',
  settlement: 'Full and final settlement',
  reimbursement: 'Reimbursement',
  vendor_bill: 'Vendor bill',
};
