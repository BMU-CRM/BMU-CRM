'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import {
  candidateStageLabels,
  candidateStages,
  interviewModeLabels,
  letterKindLabels,
  letterKinds,
  openingStatusLabels,
} from '@/lib/validation/recruitmentSchema';
import {
  convertCandidateAction,
  moveCandidateAction,
  recordInterviewOutcomeAction,
  saveCandidateAction,
  saveLetterTemplateAction,
  saveOnboardingItemAction,
  saveOpeningAction,
  scheduleInterviewAction,
} from '@/server/actions/recruitmentActions';
import styles from './RecruitmentForms.module.css';

const text = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value));

type Opening = {
  id: string;
  title: string;
  department_id: string | null;
  designation_id: string | null;
  employment_type_id: string | null;
  positions: number;
  location: string | null;
  description: string | null;
  status: string;
};

type Options = { departments: SelectOption[]; designations: SelectOption[]; employmentTypes?: SelectOption[]; openings?: SelectOption[] };

export function OpeningForm({ opening, options }: { opening?: Opening; options: Options }) {
  const [result, formAction] = useActionState(saveOpeningAction.bind(null, opening?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Job title" name="title" defaultValue={opening?.title} required error={errors?.title} />
        <SelectField label="Department" name="departmentId" options={options.departments} placeholder="None" defaultValue={opening?.department_id ?? ''} error={errors?.departmentId} />
        <SelectField label="Designation" name="designationId" options={options.designations} placeholder="None" defaultValue={opening?.designation_id ?? ''} error={errors?.designationId} />
        <SelectField label="Employment type" name="employmentTypeId" options={options.employmentTypes ?? []} placeholder="Not set" defaultValue={opening?.employment_type_id ?? ''} error={errors?.employmentTypeId} />
        <TextField label="Positions" name="positions" type="number" min={1} max={100} defaultValue={opening?.positions ?? 1} error={errors?.positions} />
        <TextField label="Location" name="location" defaultValue={text(opening?.location)} error={errors?.location} />
        <SelectField
          label="Status"
          name="status"
          options={Object.entries(openingStatusLabels).map(([value, label]) => ({ value, label }))}
          defaultValue={opening?.status ?? 'open'}
          error={errors?.status}
        />
      </FormGrid>
      <TextAreaField label="Description" name="description" rows={6} defaultValue={text(opening?.description)} error={errors?.description} />
      <FormActions>
        <SubmitButton label="Save opening" pendingLabel="Saving…" />
        <ButtonLink href="/hr/recruitment/openings" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type CandidateValues = {
  id: string;
  opening_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  department_id: string | null;
  experience_years: number | null;
  current_salary: number | null;
  expected_salary: number | null;
  skills: string[];
  source: string | null;
  portfolio_url: string | null;
  notes: string | null;
  offered_designation_id: string | null;
  offered_salary: number | null;
  offered_joining_date: string | null;
};

export function CandidateForm({ candidate, options, openingId }: { candidate?: CandidateValues; options: Options; openingId?: string }) {
  const [result, formAction] = useActionState(saveCandidateAction.bind(null, candidate?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Full name" name="fullName" defaultValue={candidate?.full_name} required error={errors?.fullName} />
        <TextField label="Email" name="email" type="email" defaultValue={text(candidate?.email)} error={errors?.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={text(candidate?.phone)} error={errors?.phone} />
        <SelectField label="Job opening" name="openingId" options={options.openings ?? []} placeholder="None" defaultValue={candidate?.opening_id ?? openingId ?? ''} error={errors?.openingId} />
        <TextField label="Position applied for" name="position" defaultValue={text(candidate?.position)} error={errors?.position} />
        <SelectField label="Department" name="departmentId" options={options.departments} placeholder="None" defaultValue={candidate?.department_id ?? ''} error={errors?.departmentId} />
        <TextField label="Experience (years)" name="experienceYears" type="number" min={0} max={60} step="0.5" defaultValue={text(candidate?.experience_years)} error={errors?.experienceYears} />
        <TextField label="Current salary (yearly)" name="currentSalary" inputMode="decimal" defaultValue={text(candidate?.current_salary)} error={errors?.currentSalary} />
        <TextField label="Expected salary (yearly)" name="expectedSalary" inputMode="decimal" defaultValue={text(candidate?.expected_salary)} error={errors?.expectedSalary} />
        <TextField label="Skills" name="skills" defaultValue={candidate?.skills.join(', ')} hint="Separate with commas." error={errors?.skills} />
        <TextField label="Source" name="source" defaultValue={text(candidate?.source)} placeholder="Referral, LinkedIn, Naukri…" error={errors?.source} />
        <TextField label="Portfolio link" name="portfolioUrl" type="url" defaultValue={text(candidate?.portfolio_url)} error={errors?.portfolioUrl} />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={3} defaultValue={text(candidate?.notes)} error={errors?.notes} />
      <fieldset className={styles.group}>
        <legend className={formStyles.label}>Offer, for the offer letter</legend>
        <FormGrid>
          <SelectField label="Offered designation" name="offeredDesignationId" options={options.designations} placeholder="None" defaultValue={candidate?.offered_designation_id ?? ''} error={errors?.offeredDesignationId} />
          <TextField label="Offered yearly CTC" name="offeredSalary" inputMode="decimal" defaultValue={text(candidate?.offered_salary)} error={errors?.offeredSalary} />
          <TextField label="Joining date" name="offeredJoiningDate" type="date" defaultValue={text(candidate?.offered_joining_date)} error={errors?.offeredJoiningDate} />
        </FormGrid>
      </fieldset>
      <FormActions>
        <SubmitButton label="Save candidate" pendingLabel="Saving…" />
        <ButtonLink href={candidate ? `/hr/recruitment/candidates/${candidate.id}` : '/hr/recruitment/candidates'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function CandidateStageForm({ candidateId, stage }: { candidateId: string; stage: string }) {
  return (
    <InlineActionForm action={moveCandidateAction.bind(null, candidateId)} submitLabel="Move">
      <SelectField
        label="Stage"
        name="stage"
        id={`stage-${candidateId}`}
        options={candidateStages.filter((item) => item !== 'joined').map((item) => ({ value: item, label: candidateStageLabels[item] }))}
        defaultValue={stage}
      />
    </InlineActionForm>
  );
}

export function InterviewForm({ candidateId, interviewers, defaultDate }: { candidateId: string; interviewers: SelectOption[]; defaultDate: string }) {
  const [result, formAction] = useActionState(scheduleInterviewAction.bind(null, candidateId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Round" name="roundName" defaultValue="First round" required error={errors?.roundName} />
        <SelectField label="Interviewer" name="interviewerId" options={interviewers} placeholder="Choose someone" required error={errors?.interviewerId} />
        <TextField label="Date" name="date" type="date" defaultValue={defaultDate} required error={errors?.date} />
        <TextField label="Time" name="time" type="time" defaultValue="11:00" required error={errors?.time} />
        <TextField label="Length (minutes)" name="durationMinutes" type="number" min={15} max={480} step={15} defaultValue={60} error={errors?.durationMinutes} />
        <SelectField
          label="How"
          name="mode"
          options={Object.entries(interviewModeLabels).map(([value, label]) => ({ value, label }))}
          defaultValue="in_person"
          error={errors?.mode}
        />
        <TextField label="Location" name="location" error={errors?.location} />
        <TextField label="Video link" name="meetingLink" type="url" placeholder="https://" error={errors?.meetingLink} />
      </FormGrid>
      <p className={formStyles.hint}>It goes on the calendar as a meeting with the interviewer, with the usual invitation and reminders.</p>
      <FormActions>
        <SubmitButton label="Schedule interview" pendingLabel="Scheduling…" />
        <ButtonLink href={`/hr/recruitment/candidates/${candidateId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Outcome = { id: string; status: string; feedback: string | null; rating: number | null };

export function InterviewOutcomeForm({ interview, returnTo }: { interview: Outcome; returnTo: string }) {
  const [result, formAction] = useActionState(recordInterviewOutcomeAction.bind(null, interview.id, returnTo), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField
          label="Outcome"
          name="status"
          options={[
            { value: 'completed', label: 'Interview done' },
            { value: 'scheduled', label: 'Still to happen' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          defaultValue={interview.status === 'scheduled' ? 'completed' : interview.status}
          error={errors?.status}
        />
        <SelectField
          label="Rating"
          name="rating"
          options={['1', '2', '3', '4', '5'].map((value) => ({ value, label: `${value} of 5` }))}
          placeholder="No rating"
          defaultValue={interview.rating ? String(interview.rating) : ''}
          error={errors?.rating}
        />
      </FormGrid>
      <TextAreaField label="Feedback" name="feedback" rows={5} defaultValue={interview.feedback ?? ''} hint="Strengths, concerns and your recommendation." error={errors?.feedback} />
      <FormActions>
        <SubmitButton label="Save feedback" pendingLabel="Saving…" />
        <ButtonLink href={returnTo} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type ConversionDefaults = {
  fullName: string;
  workEmail: string;
  phone: string;
  departmentId: string;
  designationId: string;
  joiningDate: string;
};

export function ConversionForm({
  candidateId,
  defaults,
  options,
  roles,
  managers,
}: {
  candidateId: string;
  defaults: ConversionDefaults;
  options: Options;
  roles: SelectOption[] | null;
  managers: SelectOption[];
}) {
  const [result, formAction] = useActionState(convertCandidateAction.bind(null, candidateId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Full name" name="fullName" defaultValue={defaults.fullName} required error={errors?.fullName} />
        <TextField label="Work email" name="workEmail" type="email" defaultValue={defaults.workEmail} required hint="They sign in with this." error={errors?.workEmail} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={defaults.phone} error={errors?.phone} />
        {roles && <SelectField label="Role" name="roleId" options={roles} placeholder="The default role" error={errors?.roleId} />}
        <SelectField label="Department" name="departmentId" options={options.departments} placeholder="None" defaultValue={defaults.departmentId} error={errors?.departmentId} />
        <SelectField label="Designation" name="designationId" options={options.designations} placeholder="None" defaultValue={defaults.designationId} error={errors?.designationId} />
        <SelectField label="Reporting manager" name="reportingManagerId" options={managers} placeholder="None" error={errors?.reportingManagerId} />
        <TextField label="Joining date" name="joiningDate" type="date" defaultValue={defaults.joiningDate} required error={errors?.joiningDate} />
      </FormGrid>
      <p className={formStyles.hint}>An employee ID is given, an invitation link is created as for Add employee, and the onboarding checklist starts.</p>
      <FormActions>
        <SubmitButton label="Convert to employee" pendingLabel="Adding…" />
        <ButtonLink href={`/hr/recruitment/candidates/${candidateId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Template = { id: string; kind: string; name: string; subject: string; body: string; is_active: boolean };

export function LetterTemplateForm({ template }: { template?: Template }) {
  const [result, formAction] = useActionState(saveLetterTemplateAction.bind(null, template?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Letter" name="kind" options={letterKinds.map((kind) => ({ value: kind, label: letterKindLabels[kind] }))} defaultValue={template?.kind ?? 'offer'} error={errors?.kind} />
        <TextField label="Template name" name="name" defaultValue={template?.name} required error={errors?.name} />
        <TextField label="Subject line" name="subject" defaultValue={template?.subject} required error={errors?.subject} />
      </FormGrid>
      <TextAreaField
        label="Letter"
        name="body"
        rows={14}
        defaultValue={template?.body}
        hint="These are filled in when printing: {{name}}, {{designation}}, {{department}}, {{company}}, {{salary}}, {{joining_date}}, {{employee_code}}, {{start_date}}, {{end_date}}, {{last_working_day}}, {{today}}."
        error={errors?.body}
      />
      {template && (
        <label className={styles.choice}>
          <input type="checkbox" name="isActive" defaultChecked={template.is_active} /> In use
        </label>
      )}
      <FormActions>
        <SubmitButton label="Save template" pendingLabel="Saving…" />
        <ButtonLink href="/settings/hr/recruitment" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function OnboardingItemForm({ item }: { item?: { id: string; name: string; is_active: boolean } }) {
  const [result, formAction] = useActionState(saveOnboardingItemAction.bind(null, item?.id ?? null), idleResult);
  const prefix = `onboarding-${item?.id ?? 'new'}`;
  return (
    <KeepValuesForm action={formAction} key={!item && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <TextField label="Item" name="name" id={`${prefix}-name`} defaultValue={item?.name} required error={result.fieldErrors?.name} />
        {item && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={item.is_active} /> In use
          </label>
        )}
        <SubmitButton label={item ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}
