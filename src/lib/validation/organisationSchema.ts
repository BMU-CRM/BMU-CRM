import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(500, 'Use 500 characters or fewer.')
  .transform((value) => (value === '' ? null : value));

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.uuid('Choose a valid option.').nullable());

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Enter a department name.').max(100, 'Use 100 characters or fewer.'),
  description: optionalText,
  parentDepartmentId: optionalId,
  headEmployeeId: optionalId,
});

export const designationSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title.').max(100, 'Use 100 characters or fewer.'),
  managementLevel: z.coerce
    .number({ error: 'Enter a level from 1 to 20.' })
    .int('Enter a whole number.')
    .min(1, 'Enter a level from 1 to 20.')
    .max(20, 'Enter a level from 1 to 20.'),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a role name.').max(100, 'Use 100 characters or fewer.'),
  description: optionalText,
});
