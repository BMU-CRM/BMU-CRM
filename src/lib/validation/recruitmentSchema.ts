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

const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value.replaceAll(',', ''))))
  .pipe(z.number({ error: 'Enter an amount.' }).min(0, 'Enter zero or more.').max(99_99_99_999).nullable());

export const candidateStages = [
  'new',
  'shortlisted',
  'interview_scheduled',
  'interview_done',
  'selected',
  'rejected',
  'offer_released',
  'offer_accepted',
  'joined',
] as const;
export type CandidateStage = (typeof candidateStages)[number];

export const candidateStageLabels: Record<CandidateStage, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  interview_done: 'Interview done',
  selected: 'Selected',
  rejected: 'Rejected',
  offer_released: 'Offer released',
  offer_accepted: 'Offer accepted',
  joined: 'Joined',
};

export const openingStatusLabels: Record<string, string> = { open: 'Open', on_hold: 'On hold', closed: 'Closed' };
export const interviewModeLabels: Record<string, string> = { in_person: 'In person', video: 'Video call', phone: 'Phone' };
export const interviewStatusLabels: Record<string, string> = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' };

export const jobOpeningSchema = z.object({
  title: z.string().trim().min(2, 'Enter the job title.').max(120),
  departmentId: optionalId,
  designationId: optionalId,
  employmentTypeId: optionalId,
  positions: z.coerce.number({ error: 'Enter a number.' }).int().min(1, 'Enter 1 or more.').max(100, 'Enter 100 or fewer.'),
  location: optionalText(120),
  description: optionalText(8000),
  status: z.enum(['open', 'on_hold', 'closed']),
});

export const candidateSchema = z.object({
  openingId: optionalId,
  fullName: z.string().trim().min(2, 'Enter the name.').max(120),
  email: optionalText(254).pipe(z.email('Enter a valid email.').nullable()),
  phone: optionalText(20).pipe(z.string().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.').nullable()),
  position: optionalText(120),
  departmentId: optionalId,
  experienceYears: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number({ error: 'Enter years.' }).min(0).max(60, 'Enter 60 or fewer.').nullable()),
  currentSalary: optionalMoney,
  expectedSalary: optionalMoney,
  skills: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(50, 'Keep each skill under 50 characters.')).max(30, 'Add up to 30 skills.')),
  source: optionalText(60),
  portfolioUrl: optionalText(500).pipe(z.url({ protocol: /^https?$/, error: 'Enter a full web address.' }).nullable()),
  notes: optionalText(4000),
  offeredDesignationId: optionalId,
  offeredSalary: optionalMoney,
  offeredJoiningDate: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.iso.date('Enter a valid date.').nullable()),
});

export const candidateStageSchema = z.object({
  stage: z.enum(candidateStages.filter((stage) => stage !== 'joined') as [CandidateStage, ...CandidateStage[]], { error: 'Choose a stage.' }),
});

export const interviewSchema = z.object({
  roundName: z.string().trim().min(2, 'Name the round.').max(80),
  date: z.iso.date('Choose a date.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time.'),
  durationMinutes: z.coerce.number().int().min(15, 'At least 15 minutes.').max(480, 'At most 8 hours.'),
  interviewerId: z.uuid('Choose an interviewer.'),
  mode: z.enum(['in_person', 'video', 'phone']),
  location: z.string().trim().max(200),
  meetingLink: z
    .string()
    .trim()
    .refine((value) => value === '' || /^https:\/\/\S+$/.test(value), 'Enter a full https:// address.'),
});

export const interviewOutcomeSchema = z
  .object({
    status: z.enum(['scheduled', 'completed', 'cancelled']),
    feedback: z.string().trim().max(4000),
    rating: z
      .string()
      .transform((value) => (value === '' ? null : Number(value)))
      .pipe(z.number().int().min(1).max(5).nullable()),
  })
  .refine((values) => values.status !== 'completed' || values.rating !== null, { message: 'Give a rating.', path: ['rating'] });

export const conversionSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(120),
  workEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid work email.')),
  phone: optionalText(20).pipe(z.string().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.').nullable()),
  roleId: z.uuid('Choose a role.').optional(),
  designationId: optionalId,
  departmentId: optionalId,
  reportingManagerId: optionalId,
  joiningDate: z.iso.date('Enter the joining date.'),
});

export const letterKinds = ['offer', 'internship_completion', 'experience', 'relieving'] as const;
export type LetterKind = (typeof letterKinds)[number];
export const letterKindLabels: Record<LetterKind, string> = {
  offer: 'Offer letter',
  internship_completion: 'Internship completion',
  experience: 'Experience letter',
  relieving: 'Relieving letter',
};

export const letterTemplateSchema = z.object({
  kind: z.enum(letterKinds),
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  subject: z.string().trim().min(2, 'Enter a subject.').max(200),
  body: z.string().trim().min(10, 'Write the letter.').max(20000),
  isActive: z.boolean(),
});

export const onboardingItemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  isActive: z.boolean(),
});
