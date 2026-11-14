import { z } from 'zod';
import { dayStatusOverrides } from '@/lib/attendance/summariseAttendance';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value));

const date = z.iso.date('Enter a valid date.');

export const leaveRequestSchema = z
  .object({
    leaveTypeId: z.uuid('Choose a leave type.'),
    startDate: date,
    endDate: date,
    isHalfDay: z.boolean(),
    reason: z.string().trim().min(3, 'Give a short reason.').max(2000, 'Use 2000 characters or fewer.'),
    attachmentFileId: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .pipe(z.uuid().nullable()),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'The last day must be on or after the first day.',
    path: ['endDate'],
  })
  .refine((values) => values.startDate.slice(0, 4) === values.endDate.slice(0, 4), {
    message: 'Leave across two years needs a request for each year.',
    path: ['endDate'],
  })
  .refine((values) => !values.isHalfDay || values.startDate === values.endDate, {
    message: 'A half day must start and end on the same day.',
    path: ['isHalfDay'],
  });

export const leaveDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: optionalText(1000),
});

// An optional number from a form box: empty becomes null.
const optionalNumber = (check: (value: z.ZodNumber) => z.ZodNumber, message: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(check(z.number({ error: message })).nullable());

export const leaveTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
    yearlyAllowance: optionalNumber((value) => value.min(0, 'Enter zero or more.').max(365, 'Enter 365 or fewer.'), 'Enter a number of days.'),
    isPaid: z.boolean(),
    requiresAttachment: z.boolean(),
    isActive: z.boolean(),
    carryForwardCap: optionalNumber(
      (value) => value.gt(0, 'Enter more than 0, or leave empty for none.').max(365, 'Enter 365 or fewer.').multipleOf(0.5, 'Use whole or half days.'),
      'Enter a number of days.',
    ),
    carryForwardExpiryMonths: optionalNumber((value) => value.int('Enter whole months.').min(1, 'Enter 1 to 12.').max(12, 'Enter 1 to 12.'), 'Enter months.'),
    isEncashable: z.boolean(),
  })
  .refine((values) => values.carryForwardCap === null || values.yearlyAllowance !== null, {
    message: 'Only leave with a yearly allowance can carry forward.',
    path: ['carryForwardCap'],
  });

export const holidayKinds = ['public', 'company'] as const;
export const holidayKindLabels: Record<(typeof holidayKinds)[number], string> = {
  public: 'Public holiday',
  company: 'Company holiday',
};

export const holidaySchema = z.object({
  holidayDate: date,
  name: z.string().trim().min(2, 'Enter a name.').max(120, 'Use 120 characters or fewer.'),
  kind: z.enum(holidayKinds, { error: 'Choose public or company.' }),
  description: optionalText(500),
});

export const employmentTypeSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(60, 'Use 60 characters or fewer.'),
  isActive: z.boolean(),
});

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time such as 09:30.');

export const workingHoursSchema = z
  .object({
    workStart: clock,
    workEnd: clock,
    lateGraceMinutes: z.coerce
      .number({ error: 'Enter minutes.' })
      .int('Enter whole minutes.')
      .min(0, 'Enter 0 or more.')
      .max(240, 'Enter 240 or fewer.'),
    workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Choose at least one working day.'),
    // Hours in the form, minutes in the database. Empty means not set up yet.
    overtimeAfterHours: optionalNumber((value) => value.min(1, 'Enter 1 to 24 hours.').max(24, 'Enter 1 to 24 hours.'), 'Enter hours.'),
    halfDayHours: optionalNumber((value) => value.min(0.5, 'Enter 0.5 to 24 hours.').max(24, 'Enter 0.5 to 24 hours.'), 'Enter hours.'),
    defaultProbationMonths: optionalNumber((value) => value.int('Enter whole months.').min(0, 'Enter 0 to 24.').max(24, 'Enter 0 to 24.'), 'Enter months.'),
  })
  .refine((values) => values.workEnd > values.workStart, {
    message: 'The day must end after it starts.',
    path: ['workEnd'],
  });

export const workModes = ['office', 'wfh'] as const;
export const workModeLabels: Record<(typeof workModes)[number], string> = { office: 'Office', wfh: 'Work from home' };

export const attendanceCorrectionSchema = z.object({
  employeeId: z.uuid('Choose an employee.'),
  workDate: date,
  checkIn: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 09:30.'),
  checkOut: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 18:30.'),
  workMode: z.enum(workModes, { error: 'Choose office or home.' }),
  statusOverride: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.enum(dayStatusOverrides, { error: 'Choose a status.' }).nullable()),
  note: optionalText(500),
});

// Several people and days at once. Empty means "leave as it is".
const keepOr = <T extends readonly [string, ...string[]]>(values: T, error: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.enum(values, { error }).nullable());

export const bulkAttendanceCorrectionSchema = z
  .object({
    employeeIds: z.array(z.uuid()).min(1, 'Choose at least one person.').max(500, 'Choose up to 500 people at a time.'),
    fromDate: date,
    toDate: date,
    checkIn: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 09:30.').transform((value) => value || null),
    checkOut: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 18:30.').transform((value) => value || null),
    workMode: keepOr(workModes, 'Choose office or home.'),
    statusOverride: keepOr(['auto', ...dayStatusOverrides] as const, 'Choose a status.'),
    note: z.string().trim().min(1, 'Give a reason for the correction.').max(500, 'Up to 500 characters.'),
  })
  .refine((value) => value.toDate >= value.fromDate, { path: ['toDate'], message: 'Must be on or after the start date.' })
  .refine((value) => !value.checkIn || !value.checkOut || value.checkOut >= value.checkIn, { path: ['checkOut'], message: 'Must be after check-in.' })
  .refine((value) => value.checkIn || value.checkOut || value.workMode || value.statusOverride, {
    path: ['checkIn'],
    message: 'Fill in at least one thing to change.',
  });

export const leaveListStatuses =['pending', 'approved', 'rejected', 'cancelled'] as const;
export const leaveListSorts = ['start-desc', 'start-asc', 'requested-desc', 'days-desc'] as const;
