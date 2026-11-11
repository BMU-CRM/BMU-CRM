import { z } from 'zod';
import { employeeDocumentTypes, type EmployeeDocumentType } from '@/lib/employees/employeeRecordLabels';

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

export const fileLinksSchema = z.object({
  clientId: optionalId,
  projectId: optionalId,
  taskId: optionalId,
  meetingId: optionalId,
  ticketId: optionalId,
  employeeId: optionalId,
  documentType: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.enum(employeeDocumentTypes, { error: 'Choose a document type.' }).nullable()),
});

// An employee document always has a type, and only employee documents have one.
const documentTypeMatches = (links: { employeeId: string | null; documentType: string | null }) =>
  (links.employeeId === null) === (links.documentType === null);
const documentTypeProblem = { message: 'Choose a document type.', path: ['documentType'] };

// The records a file can be attached to. An employee document also has a type.
export type FileLinks = {
  clientId?: string;
  projectId?: string;
  taskId?: string;
  meetingId?: string;
  ticketId?: string;
  employeeId?: string;
  documentType?: EmployeeDocumentType;
};

export const startUploadSchema = fileLinksSchema
  .extend({
    name: z.string().trim().min(1).max(255),
    description: optionalText(2000),
  })
  .refine(documentTypeMatches, documentTypeProblem);

// Only web addresses are stored, because these values are later rendered as links.
export const driveLinkSchema = fileLinksSchema
  .extend({
    name: z.string().trim().min(1, 'Enter a name.').max(255, 'Use 255 characters or fewer.'),
    url: z.url({ protocol: /^https$/, error: 'Enter a full https:// address.' }),
    description: optionalText(2000),
  })
  .refine(documentTypeMatches, documentTypeProblem);

export const fileDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(255, 'Use 255 characters or fewer.'),
  description: optionalText(2000),
});

export const fileShareSchema = z
  .object({
    employeeIds: z.array(z.uuid()).max(100, 'Choose up to 100 people.'),
    departmentIds: z.array(z.uuid()).max(50, 'Choose up to 50 departments.'),
    note: optionalText(1000),
    expiresOn: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .pipe(z.iso.date('Enter a valid date.').nullable()),
  })
  .refine((values) => values.employeeIds.length + values.departmentIds.length > 0, {
    message: 'Choose at least one person or department.',
    path: ['employeeIds'],
  });

export const fileCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first.').max(4000, 'Use 4000 characters or fewer.'),
});
