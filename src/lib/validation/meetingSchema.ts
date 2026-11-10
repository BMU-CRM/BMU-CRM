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

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time such as 10:00.');

export const meetingKinds = ['internal', 'department', 'management', 'client', 'project', 'one_to_one'] as const;

export const meetingKindLabels: Record<(typeof meetingKinds)[number], string> = {
  internal: 'Internal',
  department: 'Department',
  management: 'Management',
  client: 'Client',
  project: 'Project',
  one_to_one: 'One to one',
};

// Only web addresses are stored, because these values are later rendered as links.
const meetingLink = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.url({ protocol: /^https$/, error: 'Enter a full https:// meeting link.' }).nullable());

export const meetingSchema = z
  .object({
    title: z.string().trim().min(2, 'Enter a title.').max(200, 'Use 200 characters or fewer.'),
    agenda: optionalText(4000),
    kind: z.enum(meetingKinds, { error: 'Choose a type.' }),
    date: z.iso.date('Enter a valid date.'),
    startTime: clock,
    endTime: clock,
    location: optionalText(200),
    meetingLink,
    clientId: optionalId,
    projectId: optionalId,
    participantIds: z.array(z.uuid()).max(200, 'Invite up to 200 people.'),
  })
  .refine((values) => values.endTime > values.startTime, {
    message: 'The meeting must end after it starts.',
    path: ['endTime'],
  });

export const meetingNotesSchema = z.object({
  notes: optionalText(20000),
  decisions: optionalText(10000),
});
