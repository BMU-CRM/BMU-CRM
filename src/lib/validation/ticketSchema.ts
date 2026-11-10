import { z } from 'zod';
import type { Database } from '@/types/databaseTypes';

export type TicketStatus = Database['public']['Enums']['ticket_status'];

export const ticketStatusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  waiting_for_response: 'Waiting for reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid('Choose a valid option.').nullable());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value));

const priority = z.enum(['low', 'medium', 'high', 'urgent'], { error: 'Choose a priority.' });

export const ticketSchema = z.object({
  title: z.string().trim().min(3, 'Enter a short summary.').max(200, 'Use 200 characters or fewer.'),
  description: z.string().trim().min(3, 'Describe the problem.').max(8000, 'Use 8000 characters or fewer.'),
  categoryId: z.uuid('Choose a category.'),
  priority,
});

export const ticketHandlingSchema = z.object({
  assignedTo: optionalId,
  priority,
});

export const ticketCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a reply first.').max(4000, 'Use 4000 characters or fewer.'),
});

export const ticketResolutionSchema = z
  .string()
  .trim()
  .min(3, 'Describe how the ticket was resolved.')
  .max(4000, 'Use 4000 characters or fewer.');

export const ticketCategorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  description: optionalText(300),
  handlingDepartmentId: optionalId,
  defaultAssigneeId: optionalId,
  isActive: z.boolean(),
});
