import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';
import { gstinPattern } from './financeSchema';
import { paymentMethods } from './payrollSchema';

export type PurchaseOrderStatus = Database['public']['Enums']['purchase_order_status'];

export const purchaseOrderStatusLabels: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const vendorBillStatusLabels: Record<string, string> = { unpaid: 'Unpaid', part_paid: 'Part paid', paid: 'Paid' };

export function vendorBillStatus(amount: number, paid: number) {
  return paid >= amount ? 'paid' : paid > 0 ? 'part_paid' : 'unpaid';
}

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

const amount = (message: string, allowZero = false) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' && allowZero ? 0 : Number(value.replaceAll(',', ''))))
    .pipe(
      z
        .number({ error: message })
        .min(0, message)
        .refine((value) => allowZero || value > 0, 'Enter more than zero.')
        .refine((value) => value <= 99_99_99_999, 'That amount is too large.'),
    )
    .transform((value) => Math.round(value * 100) / 100);

export const vendorSchema = z.object({
  name: z.string().trim().min(2, 'Enter the vendor name.').max(160),
  contactPerson: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.email('Enter a valid email address.').nullable()),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.').nullable()),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().regex(gstinPattern, 'Enter a valid 15-character GSTIN.').nullable()),
  address: optionalText(500),
  state: optionalText(60),
  paymentTermsDays: z.coerce.number({ error: 'Enter a number of days.' }).int('Enter whole days.').min(0).max(365, 'Use 365 days or fewer.'),
  notes: optionalText(2000),
  isActive: z.boolean(),
});

export const purchaseOrderSchema = z
  .object({
    vendorId: z.uuid('Choose a vendor.'),
    title: z.string().trim().min(2, 'Enter what it is for.').max(200),
    orderDate: z.iso.date('Enter a valid date.'),
    expectedDate: optionalDate,
    placeOfSupply: optionalText(60),
    deliveryAddress: optionalText(500),
    notes: optionalText(2000),
    terms: optionalText(2000),
  })
  .refine((values) => !values.expectedDate || values.expectedDate >= values.orderDate, {
    path: ['expectedDate'],
    message: 'This must be on or after the order date.',
  });

export const vendorBillSchema = z
  .object({
    vendorId: z.uuid('Choose a vendor.'),
    purchaseOrderId: optionalId,
    billNumber: z.string().trim().min(1, "Enter the vendor's bill number.").max(60),
    billDate: z.iso.date('Enter the bill date.'),
    dueDate: z.iso.date('Enter the due date.'),
    amount: amount('Enter the bill total.'),
    taxAmount: amount('Enter the GST, or 0.', true),
    categoryId: z.uuid('Choose a category.'),
    departmentId: optionalId,
    fileId: optionalId,
    description: optionalText(1000),
  })
  .refine((values) => values.dueDate >= values.billDate, { path: ['dueDate'], message: 'The due date cannot be before the bill date.' })
  .refine((values) => values.taxAmount <= values.amount, { path: ['taxAmount'], message: 'The GST cannot be more than the bill total.' });

export const billPaymentSchema = z.object({
  amount: amount('Enter the amount paid.'),
  paidOn: z.iso.date('Enter the date it was paid.'),
  method: z.enum(paymentMethods, { error: 'Choose how it was paid.' }),
  reference: optionalText(120),
  accountId: z.uuid('Choose the account it was paid from.'),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason.').max(500, 'Use 500 characters or fewer.'),
});
