import { z } from 'zod';

export const serviceGroupSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  isActive: z.boolean(),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120, 'Use 120 characters or fewer.'),
  groupId: z.uuid('Choose the service it belongs to.'),
  isActive: z.boolean(),
});

export const industrySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  isActive: z.boolean(),
});
