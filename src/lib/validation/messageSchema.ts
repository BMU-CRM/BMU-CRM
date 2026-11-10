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
  })
  .refine((values) => values.body.length > 0 || values.fileId !== null, {
    message: 'Write a message or attach a file.',
    path: ['body'],
  });

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'A message cannot be empty.').max(8000, 'Messages can be up to 8000 characters.'),
});

export const groupConversationSchema = z.object({
  title: z.string().trim().min(1, 'Name the group.').max(120, 'Use 120 characters or fewer.'),
  memberIds: z.array(z.uuid()).min(1, 'Choose at least one person.').max(100, 'Choose up to 100 people.'),
});
