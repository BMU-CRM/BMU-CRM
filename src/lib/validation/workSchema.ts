import { z } from 'zod';

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

const optionalTime = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value.slice(0, 5)))
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.').nullable());

const optionalHours = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .pipe(z.number({ error: 'Enter a number of hours.' }).min(0, 'Enter zero or more.').max(9999, 'Enter a smaller number.').nullable());

const priorities = ['low', 'medium', 'high', 'urgent'] as const;

const datesInOrder = (values: { startDate: string | null; dueDate: string | null }) =>
  !values.startDate || !values.dueDate || values.dueDate >= values.startDate;

const datesMessage = { message: 'The due date must be on or after the start date.', path: ['dueDate'] };

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a project name.').max(160, 'Use 160 characters or fewer.'),
    description: optionalText(4000),
    clientId: optionalId,
    departmentId: optionalId,
    projectManagerId: optionalId,
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled'], { error: 'Choose a status.' }),
    priority: z.enum(priorities, { error: 'Choose a priority.' }),
    startDate: optionalDate,
    dueDate: optionalDate,
  })
  .refine(datesInOrder, datesMessage);

export const milestoneSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title.').max(200, 'Use 200 characters or fewer.'),
  dueDate: optionalDate,
});

// Only web addresses are stored, because these values are later rendered as links.
const referenceLinks = z
  .string()
  .transform((value) =>
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.url({ protocol: /^https?$/, error: 'Enter full web addresses, one per line.' }))
      .max(20, 'Add up to 20 links.'),
  );

export const taskSchema = z
  .object({
    title: z.string().trim().min(2, 'Enter a task title.').max(200, 'Use 200 characters or fewer.'),
    description: optionalText(8000),
    assigneeId: optionalId,
    reviewerId: optionalId,
    projectId: optionalId,
    clientId: optionalId,
    priority: z.enum(priorities, { error: 'Choose a priority.' }),
    complexity: z.coerce.number().int().min(1, 'Choose a complexity.').max(5, 'Choose a complexity.'),
    startDate: optionalDate,
    dueDate: optionalDate,
    dueTime: optionalTime,
    estimatedHours: optionalHours,
    recurrence: z.enum(['none', 'daily', 'weekly', 'monthly'], { error: 'Choose how often it repeats.' }),
    referenceLinks,
  })
  .refine(datesInOrder, datesMessage)
  .refine((values) => !values.dueTime || values.dueDate, { message: 'Choose a due date for the time.', path: ['dueTime'] });

// A task someone plans for themselves from the calendar.
export const myTaskSchema = z.object({
  title: z.string().trim().min(2, 'Enter a task title.').max(200, 'Use 200 characters or fewer.'),
  dueDate: z.iso.date('Choose a date.'),
  dueTime: optionalTime,
  priority: z.enum(priorities, { error: 'Choose a priority.' }),
});

export const taskProgressSchema = z.object({
  completionPercentage: z.coerce
    .number({ error: 'Enter a percentage.' })
    .int('Enter a whole number.')
    .min(0, 'Enter 0 to 100.')
    .max(100, 'Enter 0 to 100.'),
  actualHours: z.coerce.number({ error: 'Enter a number of hours.' }).min(0, 'Enter zero or more.').max(9999, 'Enter a smaller number.'),
});

export const taskCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first.').max(4000, 'Use 4000 characters or fewer.'),
});

export const taskEscalationSchema = z.object({
  reason: z.string().trim().min(3, 'Explain why this needs escalating.').max(1000, 'Use 1000 characters or fewer.'),
});

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, 'Enter an item.').max(200, 'Use 200 characters or fewer.'),
});
