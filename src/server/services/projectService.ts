import 'server-only';
import { todayInIndia } from '@/lib/formatDate';
import { getProjectHealth, progressPercentage } from '@/lib/projects/projectHealth';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { ProjectStatus } from '@/lib/projects/projectHealth';

export const projectsPerPage = 25;

const projectFields = `
  id, project_code, name, description, client_id, department_id, project_manager_id,
  status, priority, start_date, due_date, completed_at,
  manager:employees!projects_project_manager_id_fkey(id, full_name),
  department:departments(name)
`;

async function addClientNames<Row extends { client_id: string | null }>(rows: Row[]) {
  const database = await createDatabaseClient();
  const clientIds = [...new Set(rows.flatMap((row) => (row.client_id ? [row.client_id] : [])))];

  if (clientIds.length === 0) return rows.map((row) => ({ ...row, clientName: null as string | null }));

  const { data, error } = await database.rpc('get_client_labels', { p_clients: clientIds });
  if (error) throw error;

  const names = new Map(data.map((client) => [client.id, client.company_name]));
  return rows.map((row) => ({ ...row, clientName: row.client_id ? (names.get(row.client_id) ?? null) : null }));
}

async function addProgress<Row extends { id: string; status: ProjectStatus; due_date: string | null }>(rows: Row[]) {
  const database = await createDatabaseClient();
  const today = todayInIndia();

  const { data, error } = await database.rpc('get_project_progress', { p_projects: rows.map((row) => row.id) });
  if (error) throw error;

  const progress = new Map(data.map((row) => [row.project_id, row]));

  return rows.map((row) => {
    const figures = progress.get(row.id);
    const totalTasks = figures?.total_tasks ?? 0;
    const completedTasks = figures?.completed_tasks ?? 0;
    const overdueTasks = figures?.overdue_tasks ?? 0;

    return {
      ...row,
      totalTasks,
      completedTasks,
      overdueTasks,
      progress: progressPercentage(completedTasks, totalTasks),
      health: getProjectHealth({ status: row.status, dueDate: row.due_date, overdueTasks }, today),
    };
  });
}

type ProjectFilters = {
  search?: string;
  status?: ProjectStatus;
  clientId?: string;
  page: number;
};

export async function listProjects({ search, status, clientId, page }: ProjectFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * projectsPerPage;

  let query = database
    .from('projects')
    .select(projectFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + projectsPerPage - 1);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`name.ilike.%${term}%,project_code.ilike.%${term}%`);
  if (status) query = query.eq('status', status);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, count, error } = await query;
  if (error) throw error;

  return { projects: await addProgress(await addClientNames(data)), total: count ?? 0 };
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>['projects'][number];

export async function getProject(projectId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database.from('projects').select(projectFields).eq('id', projectId).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [project] = await addProgress(await addClientNames([data]));
  return project ?? null;
}

export async function canManageProject(projectId: string) {
  const database = await createDatabaseClient();
  const { data } = await database.rpc('can_manage_project', { p_project: projectId });
  return data === true;
}

export async function listProjectMembers(projectId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('project_members')
    .select('employee:employees(id, full_name, designation:designations(title))')
    .eq('project_id', projectId);

  if (error) throw error;
  return data.flatMap((row) => (row.employee ? [row.employee] : []));
}

export async function listProjectMilestones(projectId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('project_milestones')
    .select('id, title, due_date, completed_at')
    .eq('project_id', projectId)
    .order('due_date', { nullsFirst: false });

  if (error) throw error;
  return data;
}

export async function listProjectOptions() {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('projects')
    .select('id, name, client_id')
    .in('status', ['planning', 'active', 'on_hold'])
    .order('name');

  if (error) throw error;
  return data;
}

export async function getProjectStats() {
  const database = await createDatabaseClient();
  const today = todayInIndia();

  const { data, error } = await database.from('projects').select('status, due_date');
  if (error) throw error;

  const open = data.filter((project) => project.status === 'active' || project.status === 'planning');

  return {
    inProgress: open.length,
    completed: data.filter((project) => project.status === 'completed').length,
    delayed: open.filter((project) => project.due_date !== null && project.due_date < today).length,
  };
}
