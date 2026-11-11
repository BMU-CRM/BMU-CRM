import { z } from 'zod';

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid().nullable());

export const messageSchema = z
  .object({
    body: z.string().trim().max(8000, 'Messages can be up to 8000 characters.'),
    replyToId: optionalId,
    fileId: optionalId,
    contactEmployeeId: optionalId,
  })
  .refine((values) => values.body.length > 0 || values.fileId !== null || values.contactEmployeeId !== null, {
    message: 'Write a message or attach something.',
    path: ['body'],
  });

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'A message cannot be empty.').max(8000, 'Messages can be up to 8000 characters.'),
});

export const groupConversationSchema = z.object({
  title: z.string().trim().min(1, 'Name the group.').max(120, 'Use 120 characters or fewer.'),
  memberIds: z.array(z.uuid()).min(1, 'Choose at least one person.').max(100, 'Choose up to 100 people.'),
});

// Only web addresses are stored, because they are shown as links.
export const chatLinkSchema = z.object({
  name: z.string().trim().max(255, 'Use 255 characters or fewer.'),
  url: z.url({ protocol: /^https$/, error: 'Enter a full https:// address.' }).max(2000),
  note: z.string().trim().max(2000, 'Use 2000 characters or fewer.'),
});

export const pollSchema = z
  .object({
    question: z.string().trim().min(1, 'Write the question.').max(300, 'Use 300 characters or fewer.'),
    options: z
      .array(z.string().trim().max(120, 'Each option can be up to 120 characters.'))
      .transform((options) => options.filter((option) => option.length > 0))
      .pipe(z.array(z.string()).min(2, 'Add at least two options.').max(12, 'Use up to 12 options.')),
    allowsMultiple: z.boolean(),
  })
  .refine((poll) => new Set(poll.options.map((option) => option.toLowerCase())).size === poll.options.length, {
    message: 'Each option must be different.',
    path: ['options'],
  });

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time.');

export const chatEventSchema = z
  .object({
    title: z.string().trim().min(2, 'Name the event.').max(200, 'Use 200 characters or fewer.'),
    date: z.iso.date('Choose a date.'),
    startTime: clock,
    endTime: clock,
    meetingLink: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .pipe(z.url({ protocol: /^https$/, error: 'Enter a full https:// meeting link.' }).nullable()),
  })
  .refine((event) => event.endTime > event.startTime, { message: 'The event must end after it starts.', path: ['endTime'] });
