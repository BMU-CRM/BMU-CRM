import { z } from 'zod';

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

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  yearlyAllowance: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number({ error: 'Enter a number of days.' }).min(0, 'Enter zero or more.').max(365, 'Enter 365 or fewer.').nullable()),
  isPaid: z.boolean(),
  requiresAttachment: z.boolean(),
  isActive: z.boolean(),
});

export const holidaySchema = z.object({
  holidayDate: date,
  name: z.string().trim().min(2, 'Enter a name.').max(120, 'Use 120 characters or fewer.'),
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
  })
  .refine((values) => values.workEnd > values.workStart, {
    message: 'The day must end after it starts.',
    path: ['workEnd'],
  });

export const attendanceCorrectionSchema = z.object({
  employeeId: z.uuid('Choose an employee.'),
  workDate: date,
  checkIn: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 09:30.'),
  checkOut: z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Enter a time such as 18:30.'),
  note: optionalText(500),
});
