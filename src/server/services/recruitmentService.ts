import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import type { CandidateStage } from '@/lib/validation/recruitmentSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { listEmploymentTypes } from './employeeService';
import { listDepartments, listDesignations } from './organisationService';

export const candidatesPerPage = 25;

const candidateFields = `
  id, opening_id, full_name, email, phone, position, department_id, experience_years, current_salary, expected_salary,
  skills, source, portfolio_url, notes, stage, stage_changed_at, offered_designation_id, offered_salary, offered_joining_date,
  employee_id, created_at,
  opening:job_openings(id, title),
  department:departments(name),
  offered_designation:designations(title)
`;

export type CandidateFilters = {
  search?: string;
  stage?: CandidateStage;
  openingId?: string;
  sort: 'newest' | 'name' | 'stage-changed';
  page: number;
};

export async function listCandidates({ search, stage, openingId, sort, page }: CandidateFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * candidatesPerPage;
  let query = database.from('candidates').select(candidateFields, { count: 'exact' }).range(from, from + candidatesPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,position.ilike.%${term}%`);
  if (stage) query = query.eq('stage', stage);
  if (openingId) query = query.eq('opening_id', openingId);
  if (sort === 'name') query = query.order('full_name');
  else if (sort === 'stage-changed') query = query.order('stage_changed_at', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  const { data, count, error } = await query;
  if (error) throw error;
  return { candidates: data, total: count ?? 0 };
}

// Everyone still in the pipeline, plus those who joined or were turned down recently,
// for the board.
export async function listBoardCandidates(openingId?: string) {
  const database = await createDatabaseClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  let query = database
    .from('candidates')
    .select('id, full_name, position, stage, stage_changed_at, experience_years, opening:job_openings(title)')
    .order('stage_changed_at', { ascending: false })
    .limit(1000);
  if (openingId) query = query.eq('opening_id', openingId);
  const { data, error } = await query;
  if (error) throw error;
  return data.filter((candidate) => (candidate.stage !== 'joined' && candidate.stage !== 'rejected') || candidate.stage_changed_at >= since);
}

export async function getCandidate(candidateId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('candidates').select(candidateFields).eq('id', candidateId).maybeSingle();
  if (error) throw error;
  return data;
}

export type Candidate = NonNullable<Awaited<ReturnType<typeof getCandidate>>>;

const interviewFields = `
  id, candidate_id, round_name, scheduled_at, duration_minutes, mode, location, meeting_link, status, feedback, rating, meeting_id,
  interviewer:employees!interviews_interviewer_id_fkey(id, full_name),
  candidate:candidates(id, full_name, position)
`;

export async function listCandidateInterviews(candidateId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('interviews').select(interviewFields).eq('candidate_id', candidateId).order('scheduled_at', { ascending: false });
  if (error) throw error;
  return data;
}

export const interviewsPerPage = 25;

export async function listInterviews({ when, status, page }: { when: 'upcoming' | 'past'; status?: string; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * interviewsPerPage;
  const now = new Date().toISOString();
  let query = database
    .from('interviews')
    .select(interviewFields, { count: 'exact' })
    .range(from, from + interviewsPerPage - 1)
    .order('scheduled_at', { ascending: when === 'upcoming' });
  query = when === 'upcoming' ? query.gte('scheduled_at', now) : query.lt('scheduled_at', now);
  if (status) query = query.eq('status', status as 'scheduled');
  const { data, count, error } = await query;
  if (error) throw error;
  return { interviews: data, total: count ?? 0 };
}

export async function getInterview(interviewId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('interviews').select(interviewFields).eq('id', interviewId).maybeSingle();
  if (error) throw error;
  return data;
}

// Interviews this person is on as interviewer, for their own list.
export async function listMyInterviews(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('interviews')
    .select(interviewFields)
    .eq('interviewer_id', access.employee.id)
    .order('scheduled_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function listCandidateFiles(candidateId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .select('id, name, kind, size_bytes, external_url, created_at, owner_id')
    .eq('candidate_id', candidateId)
    .eq('status', 'ready')
    .eq('is_archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function listOpenings({ status }: { status?: string } = {}) {
  const database = await createDatabaseClient();
  let query = database
    .from('job_openings')
    .select('id, title, positions, location, status, created_at, department:departments(name), designation:designations(title), employment_type:employment_types(name)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status as 'open');
  const [{ data, error }, counts] = await Promise.all([query, database.from('candidates').select('opening_id, stage')]);
  if (error) throw error;
  if (counts.error) throw counts.error;
  return data.map((opening) => {
    const own = counts.data.filter((row) => row.opening_id === opening.id);
    return { ...opening, candidates: own.length, joined: own.filter((row) => row.stage === 'joined').length };
  });
}

export async function getOpening(openingId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('job_openings').select('*').eq('id', openingId).maybeSingle();
  if (error) throw error;
  return data;
}

// Candidates in each stage, for the HR dashboard and the board header.
export async function getRecruitmentPipeline() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('candidates').select('stage');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
  return counts;
}

export async function listOnboarding({ openOnly }: { openOnly: boolean }) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('onboarding_tasks')
    .select('id, employee_id, item_name, sort_order, done_at, employee:employees!onboarding_tasks_employee_id_fkey(id, full_name, joining_date)')
    .order('sort_order');
  if (error) throw error;
  const people = new Map<string, { id: string; name: string; joiningDate: string | null; tasks: typeof data }>();
  for (const task of data) {
    const person = people.get(task.employee_id) ?? {
      id: task.employee_id,
      name: task.employee?.full_name ?? 'Someone who has left',
      joiningDate: task.employee?.joining_date ?? null,
      tasks: [],
    };
    person.tasks.push(task);
    people.set(task.employee_id, person);
  }
  const rows = [...people.values()].sort((a, b) => (b.joiningDate ?? '').localeCompare(a.joiningDate ?? ''));
  return openOnly ? rows.filter((person) => person.tasks.some((task) => !task.done_at)) : rows;
}

export async function listEmployeeOnboarding(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('onboarding_tasks').select('id, item_name, done_at').eq('employee_id', employeeId).order('sort_order');
  if (error) throw error;
  return data;
}

export async function listLetterTemplates() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('letter_templates').select('*').order('kind').order('name');
  if (error) throw error;
  return data;
}

export async function getLetterTemplate(templateId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('letter_templates').select('*').eq('id', templateId).maybeSingle();
  if (error) throw error;
  return data;
}

// The dropdown choices the recruitment forms need.
export async function getRecruitmentOptions() {
  const [departments, designations, employmentTypes, openings] = await Promise.all([
    listDepartments(),
    listDesignations(),
    listEmploymentTypes(),
    listOpenings(),
  ]);
  return {
    departments: departments.map((department) => ({ value: department.id, label: department.name })),
    designations: designations.map((designation) => ({ value: designation.id, label: designation.title })),
    employmentTypes: employmentTypes.filter((type) => type.is_active).map((type) => ({ value: type.id, label: type.name })),
    openings: openings.filter((opening) => opening.status !== 'closed').map((opening) => ({ value: opening.id, label: opening.title })),
  };
}

export async function listOnboardingItems() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('onboarding_items').select('*').order('sort_order').order('name');
  if (error) throw error;
  return data;
}
