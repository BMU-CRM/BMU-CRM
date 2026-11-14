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

const optionalWholeNumber = (max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number({ error: message }).int(message).min(0, message).max(max, message).nullable());

const skillList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().max(50, 'Keep each skill under 50 characters.')).max(30, 'Add up to 30 skills.'));

export const updateEmployeeSchema = z.object({
  fullName,
  phone,
  // Left out when the person editing cannot change the login email.
  workEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid work email.')).optional(),
  skills: skillList,
  designationId: optionalId,
  departmentId: optionalId,
  reportingManagerId: optionalId,
  joiningDate: optionalDate,
  employmentStatus: z.enum(employmentStatuses, { error: 'Choose a status.' }),
  roleId: z.uuid('Choose a role.').optional(),
  employmentTypeId: optionalId,
  probationMonths: optionalWholeNumber(24, 'Enter 0 to 24 months.'),
  confirmationDate: optionalDate,
});

export const genders = ['female', 'male', 'other', 'prefer_not_to_say'] as const;

const limitedText = (max: number) =>
  optionalText.pipe(z.string().max(max, `Use ${max} characters or fewer.`).nullable());

// Date of birth and gender are left out when the person editing is the employee, who
// cannot change them.
export const personalDetailsSchema = z.object({
  dateOfBirth: optionalDate
    .refine((value) => value === null || value > '1900-01-01', 'Enter a valid date.')
    .optional(),
  gender: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.enum(genders, { error: 'Choose an option.' }).nullable())
    .optional(),
  personalEmail: optionalText.pipe(z.email('Enter a valid email.').max(254).nullable()),
  address: limitedText(1000),
  emergencyContactName: limitedText(120),
  emergencyContactRelation: limitedText(60),
  emergencyContactPhone: phone,
});

// Each number is optional, and left unchanged when its box is empty, because the saved
// numbers are never sent back to the browser.
const digitsOnly = (value: string) => value.replace(/[\s-]/g, '');

export const privateDetailsSchema = z.object({
  aadhaar: z
    .string()
    .transform(digitsOnly)
    .pipe(z.string().regex(/^(\d{12})?$/, 'Enter the 12-digit Aadhaar number.')),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^([A-Z]{5}\d{4}[A-Z])?$/, 'Enter a PAN such as ABCDE1234F.'))
    .transform((value) => (value === '' ? null : value)),
  bankName: optionalText.pipe(z.string().min(2, 'Enter the bank name.').max(120, 'Use 120 characters or fewer.').nullable()),
  accountNumber: z
    .string()
    .transform(digitsOnly)
    .pipe(z.string().regex(/^(\d{6,18})?$/, 'Enter 6 to 18 digits.')),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, 'Enter an IFSC such as HDFC0001234.'))
    .transform((value) => (value === '' ? null : value)),
  accountHolder: optionalText.pipe(z.string().min(2, 'Enter the account holder.').max(120, 'Use 120 characters or fewer.').nullable()),
  clearAadhaar: z.boolean(),
  clearAccountNumber: z.boolean(),
});

export const updateMyProfileSchema = z.object({
  phone,
  skills: skillList,
});
