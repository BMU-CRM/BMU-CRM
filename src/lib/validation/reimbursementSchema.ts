import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';
import { paymentMethods } from './payrollSchema';

export type ReimbursementStatus = Database['public']['Enums']['reimbursement_status'];

export const reimbursementStatuses = ['submitted', 'approved', 'rejected', 'paid', 'cancelled'] as const satisfies readonly ReimbursementStatus[];

export const reimbursementStatusLabels: Record<ReimbursementStatus, string> = {
  submitted: 'Waiting for approval',
  approved: 'Approved, to be paid',
  rejected: 'Rejected',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const reimbursementSchema = z.object({
  categoryId: z.uuid('Choose what it was for.'),
  description: z.string().trim().min(3, 'Describe what you spent on.').max(1000, 'Use 1000 characters or fewer.'),
  expenseDate: z.iso.date('Enter the date you spent it.'),
  amount: z
    .string()
    .trim()
    .transform((value) => Number(value.replaceAll(',', '')))
    .pipe(z.number({ error: 'Enter the amount.' }).gt(0, 'Enter more than zero.').max(99_99_999, 'That amount is too large.'))
    .transform((value) => Math.round(value * 100) / 100),
  receiptFileId: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.uuid('Choose a valid file.').nullable()),
});

export const claimDecisionSchema = z.object({
  note: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
});

export const claimPaymentSchema = z.object({
  paidOn: z.iso.date('Enter the date it was paid.'),
  method: z.enum(paymentMethods, { error: 'Choose how it was paid.' }),
  reference: z.string().trim().max(120, 'Use 120 characters or fewer.'),
  accountId: z.uuid('Choose the account it was paid from.'),
});

export const approvalDecisionLabels: Record<string, string> = {
  submitted: 'Sent for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  sent_back: 'Sent back for changes',
  paid: 'Paid',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
  completed: 'Completed',
};
