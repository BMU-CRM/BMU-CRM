import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';
import { gstinPattern } from './financeSchema';

export type ClientStatus = Database['public']['Enums']['client_status'];
export type ClientRecordKind = Database['public']['Enums']['client_record_kind'];
export type ClientServiceStatus = Database['public']['Enums']['client_service_status'];

export const clientStatusLabels: Record<ClientStatus, string> = {
  lead: 'Lead',
  onboarding: 'Onboarding',
  active: 'Active',
  on_hold: 'On hold',
  inactive: 'Inactive',
};

export const clientRecordLabels: Record<ClientRecordKind, string> = {
  note: 'Note',
  requirement: 'Requirement',
  feedback: 'Feedback',
  complaint: 'Complaint',
  follow_up: 'Follow-up',
};

const clientStatuses = ['lead', 'onboarding', 'active', 'on_hold', 'inactive'] as const;
const clientRecordKinds = ['note', 'requirement', 'feedback', 'complaint', 'follow_up'] as const;
const clientServiceStatuses = ['active', 'paused', 'ended'] as const;

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

// Only web addresses are stored, because these values are later rendered as links.
const website = z
  .string()
  .trim()
  .transform((value) => {
    if (value === '') return null;
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  })
  .pipe(z.url({ protocol: /^https?$/, error: 'Enter a valid website address.' }).nullable());

export const clientSchema = z.object({
  companyName: z.string().trim().min(2, 'Enter the company name.').max(160, 'Use 160 characters or fewer.'),
  contactPerson: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.email('Enter a valid email address.').nullable()),
  phone: optionalText(30),
  address: optionalText(500),
  website,
  status: z.enum(clientStatuses, { error: 'Choose a status.' }),
  onboardingDate: optionalDate,
  nextFollowUpDate: optionalDate,
  importantNotes: optionalText(2000),
  industryId: optionalId,
  serviceGroupIds: z
    .array(z.uuid('Choose services from the list.'))
    .min(1, 'Choose at least one service.')
    .max(20, 'Choose 20 services or fewer.'),
  serviceIds: z
    .array(z.uuid('Choose sub services from the list.'))
    .min(1, 'Choose at least one sub service.')
    .max(60, 'Choose 60 sub services or fewer.'),
  clientManagerId: optionalId,
  departmentId: optionalId,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().regex(gstinPattern, 'Enter a valid 15-character GSTIN.').nullable()),
  billingState: optionalText(60),
});

export const clientRecordSchema = z.object({
  kind: z.enum(clientRecordKinds, { error: 'Choose a type.' }),
  title: z.string().trim().min(2, 'Enter a title.').max(200, 'Use 200 characters or fewer.'),
  body: optionalText(4000),
  rating: z
    .string()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number().int().min(1).max(5).nullable()),
  dueDate: optionalDate,
});

export const clientServiceSchema = z.object({
  serviceId: z.uuid('Choose a service from the list.'),
  status: z.enum(clientServiceStatuses, { error: 'Choose a status.' }),
  startDate: optionalDate,
  endDate: optionalDate,
  plan: z
    .enum(['', 'starter', 'growth', 'premium'], 'Choose Starter, Growth or Premium.')
    .transform((value) => (value === '' ? null : value)),
});
