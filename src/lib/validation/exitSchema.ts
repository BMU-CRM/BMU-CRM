import { z } from 'zod';
import { paymentMethods } from './payrollSchema';

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.iso.date('Enter a valid date.').nullable());

const money = z
  .string()
  .trim()
  .transform((value) => (value === '' ? 0 : Number(value.replaceAll(',', ''))))
  .pipe(z.number({ error: 'Enter an amount.' }).min(0, 'Enter zero or more.').max(99_99_99_999))
  .transform((value) => Math.round(value * 100) / 100);

export const resignationStatusLabels: Record<string, string> = {
  submitted: 'Waiting for HR',
  approved: 'Serving notice',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  completed: 'Left',
};

export const resignationSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason.').max(4000, 'Use 4000 characters or fewer.'),
  proposedLastDay: optionalDate,
});

export const resignationDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject'], { error: 'Choose approve or reject.' }),
    lastWorkingDay: optionalDate,
    note: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
  })
  .refine((values) => values.decision === 'approve' || values.note.length > 0, { message: 'Give a reason for rejecting.', path: ['note'] });

export const exitInterviewSchema = z.object({
  interviewAt: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a date and time.').nullable()),
  notes: z
    .string()
    .trim()
    .max(4000, 'Use 4000 characters or fewer.')
    .transform((value) => (value === '' ? null : value)),
});

export const settlementSchema = z.object({
  pendingSalary: money,
  leaveEncashmentDays: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 0 : Number(value)))
    .pipe(z.number({ error: 'Enter days.' }).min(0).max(365)),
  leaveEncashmentAmount: money,
  reimbursementsDue: money,
  otherEarnings: money,
  noticeRecovery: money,
  otherDeductions: money,
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value === '' ? null : value)),
});

export const settlementPaymentSchema = z.object({
  accountId: z.uuid('Choose the account it was paid from.'),
  paidOn: z.iso.date('Enter the date it was paid.'),
  method: z.enum(paymentMethods, { error: 'Choose how it was paid.' }),
  reference: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === '' ? null : value)),
});

export const exitChecklistItemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  category: z.enum(['knowledge_transfer', 'asset', 'clearance', 'other']),
  isActive: z.boolean(),
});

export const exitCategoryLabels: Record<string, string> = {
  knowledge_transfer: 'Knowledge transfer',
  asset: 'Asset return',
  clearance: 'Clearance',
  other: 'Other',
};

export const noticePeriodSchema = z.object({
  noticePeriodDays: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number({ error: 'Enter days.' }).int('Enter whole days.').min(0, 'Enter 0 to 180.').max(180, 'Enter 0 to 180.').nullable()),
});

// Pay owed minus pay recovered. Mirrors the final_amount the database works out.
export function settlementTotal(values: {
  pending_salary: number;
  leave_encashment_amount: number;
  reimbursements_due: number;
  other_earnings: number;
  notice_recovery: number;
  other_deductions: number;
}) {
  const total =
    values.pending_salary + values.leave_encashment_amount + values.reimbursements_due + values.other_earnings - values.notice_recovery - values.other_deductions;
  return Math.round(total * 100) / 100;
}
