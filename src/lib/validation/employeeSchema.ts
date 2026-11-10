import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
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

const phone = optionalText.pipe(
  z
    .string()
    .regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.')
    .nullable(),
);

const fullName = z
  .string()
  .trim()
  .min(2, 'Enter the full name.')
  .max(120, 'Use 120 characters or fewer.');

export const employmentStatuses = ['active', 'on_leave', 'notice_period', 'exited'] as const;

export const createEmployeeSchema = z.object({
  fullName,
  workEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid work email.')),
  phone,
  // Left out when the person adding cannot choose roles; the default role is used.
  roleId: z.uuid('Choose a role.').optional(),
  designationId: optionalId,
  departmentId: optionalId,
  reportingManagerId: optionalId,
  joiningDate: optionalDate,
});

export const updateEmployeeSchema = z.object({
  fullName,
  phone,
  designationId: optionalId,
  departmentId: optionalId,
  reportingManagerId: optionalId,
  joiningDate: optionalDate,
  employmentStatus: z.enum(employmentStatuses, { error: 'Choose a status.' }),
  roleId: z.uuid('Choose a role.').optional(),
});

export const updateMyProfileSchema = z.object({
  phone,
  skills: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(50, 'Keep each skill under 50 characters.')).max(30, 'Add up to 30 skills.')),
});
