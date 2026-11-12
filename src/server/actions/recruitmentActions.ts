'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import {
  candidateSchema,
  candidateStageSchema,
  conversionSchema,
  interviewOutcomeSchema,
  interviewSchema,
  jobOpeningSchema,
  letterTemplateSchema,
  onboardingItemSchema,
} from '@/lib/validation/recruitmentSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';
import { createEmployeeWithLogin } from '@/server/services/employeeCreation';
import { getDefaultRole } from '@/server/services/employeeService';

const noPermission = 'You do not have permission to do this.';

function refreshRecruitment(candidateId?: string) {
  revalidatePath('/hr/recruitment', 'layout');
  if (candidateId) revalidatePath(`/hr/recruitment/candidates/${candidateId}`);
}

export async function saveOpeningAction(openingId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = jobOpeningSchema.safeParse({
    title: formData.get('title'),
    departmentId: formData.get('departmentId') ?? '',
    designationId: formData.get('designationId') ?? '',
    employmentTypeId: formData.get('employmentTypeId') ?? '',
    positions: formData.get('positions') || '1',
    location: formData.get('location') ?? '',
    description: formData.get('description') ?? '',
    status: formData.get('status') || 'open',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    title: values.title,
    department_id: values.departmentId,
    designation_id: values.designationId,
    employment_type_id: values.employmentTypeId,
    positions: values.positions,
    location: values.location,
    description: values.description,
    status: values.status,
  };
  const database = await createDatabaseClient();
  const { data, error } = openingId
    ? await database.from('job_openings').update(row).eq('id', openingId).select('id')
    : await database.from('job_openings').insert(row).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshRecruitment();
  redirect('/hr/recruitment/openings');
}

function candidateRow(formData: FormData) {
  return candidateSchema.safeParse({
    openingId: formData.get('openingId') ?? '',
    fullName: formData.get('fullName'),
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    position: formData.get('position') ?? '',
    departmentId: formData.get('departmentId') ?? '',
    experienceYears: formData.get('experienceYears') ?? '',
    currentSalary: formData.get('currentSalary') ?? '',
    expectedSalary: formData.get('expectedSalary') ?? '',
    skills: formData.get('skills') ?? '',
    source: formData.get('source') ?? '',
    portfolioUrl: formData.get('portfolioUrl') ?? '',
    notes: formData.get('notes') ?? '',
    offeredDesignationId: formData.get('offeredDesignationId') ?? '',
    offeredSalary: formData.get('offeredSalary') ?? '',
    offeredJoiningDate: formData.get('offeredJoiningDate') ?? '',
  });
}

export async function saveCandidateAction(candidateId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = candidateRow(formData);
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    opening_id: values.openingId,
    full_name: values.fullName,
    email: values.email,
    phone: values.phone,
    position: values.position,
    department_id: values.departmentId,
    experience_years: values.experienceYears,
    current_salary: values.currentSalary,
    expected_salary: values.expectedSalary,
    skills: values.skills,
    source: values.source,
    portfolio_url: values.portfolioUrl,
    notes: values.notes,
    offered_designation_id: values.offeredDesignationId,
    offered_salary: values.offeredSalary,
    offered_joining_date: values.offeredJoiningDate,
  };
  const database = await createDatabaseClient();
  const { data, error } = candidateId
    ? await database.from('candidates').update(row).eq('id', candidateId).select('id')
    : await database.from('candidates').insert(row).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshRecruitment(data[0]!.id);
  redirect(`/hr/recruitment/candidates/${data[0]!.id}`);
}

export async function moveCandidateAction(candidateId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = candidateStageSchema.safeParse({ stage: formData.get('stage') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('candidates').update({ stage: parsed.data.stage }).eq('id', candidateId).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshRecruitment(candidateId);
  return success('Stage changed.');
}

export async function scheduleInterviewAction(candidateId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = interviewSchema.safeParse({
    roundName: formData.get('roundName'),
    date: formData.get('date'),
    time: formData.get('time'),
    durationMinutes: formData.get('durationMinutes') || '60',
    interviewerId: formData.get('interviewerId'),
    mode: formData.get('mode') || 'in_person',
    location: formData.get('location') ?? '',
    meetingLink: formData.get('meetingLink') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { error } = await database.rpc('schedule_interview', {
    p_candidate: candidateId,
    p_round: values.roundName,
    p_at: `${values.date}T${values.time}:00+05:30`,
    p_minutes: values.durationMinutes,
    p_interviewer: values.interviewerId,
    p_mode: values.mode,
    p_location: values.location,
    p_link: values.meetingLink,
  });
  if (error) return databaseFailure(error);

  refreshRecruitment(candidateId);
  revalidatePath('/calendar');
  redirect(`/hr/recruitment/candidates/${candidateId}`);
}

// The interviewer or a recruiter records how an interview went.
export async function recordInterviewOutcomeAction(interviewId: string, returnTo: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);
  const parsed = interviewOutcomeSchema.safeParse({
    status: formData.get('status'),
    feedback: formData.get('feedback') ?? '',
    rating: formData.get('rating') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('record_interview_outcome', {
    p_interview: interviewId,
    p_status: parsed.data.status,
    p_feedback: parsed.data.feedback,
    p_rating: parsed.data.rating as number,
  });
  if (error) return databaseFailure(error);

  refreshRecruitment();
  revalidatePath(`/interviews/${interviewId}`);
  redirect(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/hr/recruitment/interviews');
}

// Adds the candidate as an employee through the usual invitation flow, then links them
// and starts their onboarding checklist.
export async function convertCandidateAction(candidateId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.recruitmentManage);
  if (!access || access.permissions[permissionKeys.employeesCreate] === undefined) {
    return failure('You need permission to add employees as well as run recruitment.');
  }

  const canChooseRole = access.permissions[permissionKeys.employeesAssignRole] !== undefined;
  const parsed = conversionSchema.safeParse({
    fullName: formData.get('fullName'),
    workEmail: formData.get('workEmail'),
    phone: formData.get('phone') ?? '',
    roleId: canChooseRole ? (formData.get('roleId') ?? '') || undefined : undefined,
    designationId: formData.get('designationId') ?? '',
    departmentId: formData.get('departmentId') ?? '',
    reportingManagerId: formData.get('reportingManagerId') ?? '',
    joiningDate: formData.get('joiningDate'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const roleId = values.roleId ?? (await getDefaultRole())?.id;
  if (!roleId) return failure('No default role is set, so choose a role.');

  const [roleCheck, placementCheck] = await Promise.all([
    database.rpc('role_is_assignable', { p_role: roleId }),
    database.rpc('can_create_employee', { p_department: values.departmentId as string, p_manager: values.reportingManagerId as string }),
  ]);
  if (roleCheck.data !== true) return failure('You do not have permission to assign this role.');
  if (placementCheck.data !== true) return failure('You cannot add someone to that department or team.');

  const created = await createEmployeeWithLogin({ ...values, roleId });
  if (created.status === 'error') return failure(created.message);

  const { error } = await database.rpc('complete_candidate_conversion', { p_candidate: candidateId, p_employee: created.id });
  if (error) return failure(`The employee was added, but linking the candidate failed: ${databaseFailure(error).message}`);

  refreshRecruitment(candidateId);
  revalidatePath('/people/employees');
  redirect(`/people/employees/${created.id}`);
}

export async function setOnboardingTaskAction(taskId: string, done: boolean): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('set_onboarding_task', { p_task: taskId, p_done: done });
  if (error) return databaseFailure(error);
  revalidatePath('/hr/recruitment', 'layout');
  return success(done ? 'Marked done.' : 'Marked not done.');
}

export async function startOnboardingAction(employeeId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('start_onboarding', { p_employee: employeeId });
  if (error) return databaseFailure(error);
  revalidatePath('/hr/recruitment', 'layout');
  return success('Onboarding checklist added.');
}

export async function saveLetterTemplateAction(templateId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = letterTemplateSchema.safeParse({
    kind: formData.get('kind'),
    name: formData.get('name'),
    subject: formData.get('subject'),
    body: formData.get('body'),
    isActive: templateId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = { kind: values.kind, name: values.name, subject: values.subject, body: values.body, is_active: values.isActive };
  const database = await createDatabaseClient();
  const { data, error } = templateId
    ? await database.from('letter_templates').update(row).eq('id', templateId).select('id')
    : await database.from('letter_templates').insert(row).select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr', 'layout');
  redirect('/settings/hr/recruitment');
}

export async function saveOnboardingItemAction(itemId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.recruitmentManage))) return failure(noPermission);
  const parsed = onboardingItemSchema.safeParse({ name: formData.get('name'), isActive: itemId ? formData.get('isActive') === 'on' : true });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = itemId
    ? await database.from('onboarding_items').update(row).eq('id', itemId).select('id')
    : await database.from('onboarding_items').insert(row).select('id');
  if (error) return databaseFailure(error, 'There is already an item with this name.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/hr', 'layout');
  return success(itemId ? 'Item saved.' : 'Item added.');
}
