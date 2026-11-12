import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';

export type FollowUpStatus = Database['public']['Enums']['follow_up_status'];

export const followUpStatuses = ['not_contacted', 'pending', 'contacted', 'promise_to_pay', 'payment_received'] as const satisfies readonly FollowUpStatus[];

export const followUpStatusLabels: Record<FollowUpStatus, string> = {
  not_contacted: 'Not contacted',
  pending: 'Pending',
  contacted: 'Contacted',
  promise_to_pay: 'Promise to pay',
  payment_received: 'Payment received',
};

// What a person can record. "Not contacted" and "Payment received" follow from the
// invoice itself.
export const recordableFollowUpStatuses = ['contacted', 'pending', 'promise_to_pay'] as const;

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.iso.date('Enter a valid date.').nullable());

export const followUpSchema = z
  .object({
    status: z.enum(recordableFollowUpStatuses, { error: 'Choose where it stands.' }),
    note: z.string().trim().min(2, 'Write what was said.').max(2000, 'Use 2000 characters or fewer.'),
    contactedOn: z.iso.date('Enter the date.'),
    nextFollowUpOn: optionalDate,
    promisedOn: optionalDate,
    promisedAmount: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : Number(value.replaceAll(',', ''))))
      .pipe(z.number({ error: 'Enter an amount.' }).gt(0, 'Enter more than zero.').nullable()),
  })
  .refine((values) => values.status !== 'promise_to_pay' || values.promisedOn !== null, {
    path: ['promisedOn'],
    message: 'Enter the date they promised to pay by.',
  })
  .refine((values) => !values.nextFollowUpOn || values.nextFollowUpOn >= values.contactedOn, {
    path: ['nextFollowUpOn'],
    message: 'The next follow-up must be after this one.',
  });
