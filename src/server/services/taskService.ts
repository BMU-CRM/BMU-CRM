import 'server-only';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { TaskActor, TaskStatus, WorkPriority } from '@/lib/tasks/taskWorkflow';
import type { CurrentAccess } from './accessService';

export const tasksPerPage = 25;

const closedStatuses = '("completed","rejected")';

const taskListFields = `
  id, task_code, title, status, priority, due_date, completion_percentage, client_id, project_id,
  parent_task_id, created_by, assignee_id, reviewer_id, escalated_to,
  assignee:employees!tasks_assignee_id_fkey(id, full_name),
  project:projects(id, name)
`;

export const taskViews = ['mine', 'assigned', 'review', 'all'] as const;
export type TaskView = (typeof taskViews)[number];

async function addClientNames<Row extends { client_id: string | null }>(rows: Row[]) {
  const database = await createDatabaseClient();
  const clientIds = [...new Set(rows.flatMap((row) => (row.client_id ? [row.client_id] : [])))];

  if (clientIds.length === 0) return rows.map((row) => ({ ...row, clientName: null as string | null }));

  const { data, error } = await database.rpc('get_client_labels', { p_clients: clientIds });
  if (error) throw error;

  const names = new Map(data.map((client) => [client.id, client.company_name]));
  return rows.map((row) => ({ ...row, clientName: row.client_id ? (names.get(row.client_id) ?? null) : null }));
}

type TaskFilters = {
  view: TaskView;
  search?: string;
  status?: TaskStatus;
  priority?: WorkPriority;
  overdue?: boolean;
  projectId?: string;
  clientId?: string;
  page: number;
};

export async function listTasks(access: CurrentAccess, filters: TaskFilters) {
  const { view, search, status, priority, overdue, projectId, clientId, page } = filters;
  const database = await createDatabaseClient();
  const from = (page - 1) * tasksPerPage;
  const me = access.employee.id;

  let query = database
    .from('tasks')
    .select(taskListFields, { count: 'exact' })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, from + tasksPerPage - 1);

  if (view === 'mine') query = query.eq('assignee_id', me);
  if (view === 'assigned') query = query.eq('created_by', me).neq('assignee_id', me);
  if (view === 'review') {
    query = query.eq('status', 'under_review').or(`assignee_id.is.null,assignee_id.neq.${me}`);
    if (access.permissions[permissionKeys.tasksManage] === undefined) {
      query = query.or(`created_by.eq.${me},reviewer_id.eq.${me}`);
    }
  }

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`title.ilike.%${term}%,task_code.ilike.%${term}%`);
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (projectId) query = query.eq('project_id', projectId);
  if (clientId) query = query.eq('client_id', clientId);
  if (overdue) query = query.lt('due_date', todayInIndia()).not('status', 'in', closedStatuses);

  // Unless asked for, finished work drops out of the personal lists.
  if (!status && !overdue && (view === 'mine' || view === 'assigned')) {
    query = query.not('status', 'in', closedStatuses);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { tasks: await addClientNames(data), total: count ?? 0 };
}

export type TaskListItem = Awaited<ReturnType<typeof listTasks>>['tasks'][number];

export async function listTasksForProject(projectId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('tasks')
    .select(taskListFields)
    .eq('project_id', projectId)
    .is('parent_task_id', null)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return addClientNames(data);
}

export async function getTask(taskId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('tasks')
    .select(
      `*,
       assignee:employees!tasks_assignee_id_fkey(id, full_name, reporting_manager_id),
       creator:employees!tasks_created_by_fkey(id, full_name),
       reviewer:employees!tasks_reviewer_id_fkey(id, full_name),
       verifier:employees!tasks_verified_by_fkey(id, full_name),
       escalatedTo:employees!tasks_escalated_to_fkey(id, full_name),
       department:departments(name),
       project:projects(id, name),
       parent:parent_task_id(id, title)`,
    )
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [task] = await addClientNames([data]);
  return task ?? null;
}

export type TaskDetails = NonNullable<Awaited<ReturnType<typeof getTask>>>;

// Mirrors guard_task_update, so the page only offers what the database will accept.
export async function getTaskActor(access: CurrentAccess, task: TaskDetails) {
  const database = await createDatabaseClient();
  const me = access.employee.id;

  const { data } = await database.rpc('can_manage_task', { p_task: task.id });
  const hasManagerAccess = data === true;

  const isAssignee = task.assignee_id === me;
  const isCreator = task.created_by === me;
  const isSelfTask = task.assignee_id === task.created_by;

  const actor: TaskActor = {
    isAssignee,
    isSelfTask,
    hasReviewer: task.reviewer_id !== null,
    canManage: hasManagerAccess && (!isAssignee || isCreator),
    canReview: (isCreator || task.reviewer_id === me || hasManagerAccess) && (!isAssignee || isSelfTask),
  };

  return actor;
}

export async function loadTaskPanels(taskId: string) {
  const database = await createDatabaseClient();

  const [subtasks, checklist, comments, collaborators, dependencies, history] = await Promise.all([
    database
      .from('tasks')
      .select('id, task_code, title, status, due_date, assignee:employees!tasks_assignee_id_fkey(full_name)')
      .eq('parent_task_id', taskId)
      .order('created_at'),
    database.from('task_checklist_items').select('id, label, is_done').eq('task_id', taskId).order('created_at'),
    database
      .from('task_comments')
      .select('id, body, created_at, updated_at, author:employees(id, full_name)')
      .eq('task_id', taskId)
      .order('created_at'),
    database.from('task_collaborators').select('employee:employees(id, full_name)').eq('task_id', taskId),
    database
      .from('task_dependencies')
      .select('blocker:tasks!task_dependencies_depends_on_task_id_fkey(id, task_code, title, status)')
      .eq('task_id', taskId),
    database.rpc('get_task_history', { p_task: taskId }),
  ]);

  for (const result of [subtasks, checklist, comments, collaborators, dependencies, history]) {
    if (result.error) throw result.error;
  }

  return {
    subtasks: subtasks.data ?? [],
    checklist: checklist.data ?? [],
    comments: comments.data ?? [],
    collaborators: (collaborators.data ?? []).flatMap((row) => (row.employee ? [row.employee] : [])),
    dependencies: (dependencies.data ?? []).flatMap((row) => (row.blocker ? [row.blocker] : [])),
    history: history.data ?? [],
  };
}

export async function listAssignableEmployees(projectId?: string | null) {
  const database = await createDatabaseClient();

  const ids = await database.rpc('get_assignable_employee_ids', projectId ? { p_project: projectId } : {});
  if (ids.error) throw ids.error;

  const { data, error } = await database.from('employees').select('id, full_name').in('id', ids.data).order('full_name');

  if (error) throw error;
  return data;
}

export async function listDependencyOptions(task: TaskDetails) {
  const database = await createDatabaseClient();

  let query = database
    .from('tasks')
    .select('id, task_code, title')
    .neq('id', task.id)
    .not('status', 'in', closedStatuses)
    .order('created_at', { ascending: false })
    .limit(100);

  if (task.project_id) query = query.eq('project_id', task.project_id);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getTaskStats(access: CurrentAccess) {
  const database = await createDatabaseClient();
  const today = todayInIndia();
  const me = access.employee.id;

  const { data, error } = await database
    .from('tasks')
    .select('status, due_date, assignee_id, created_by, reviewer_id');

  if (error) throw error;

  const open = data.filter((task) => task.status !== 'completed' && task.status !== 'rejected');
  const counted = data.filter((task) => task.status !== 'rejected');
  const canManageAll = access.permissions[permissionKeys.tasksManage] !== undefined;

  return {
    open: open.length,
    overdue: open.filter((task) => task.due_date !== null && task.due_date < today).length,
    toReview: open.filter(
      (task) =>
        task.status === 'under_review' &&
        task.assignee_id !== me &&
        (canManageAll || task.created_by === me || task.reviewer_id === me),
    ).length,
    completionRate:
      counted.length === 0
        ? null
        : Math.round((counted.filter((task) => task.status === 'completed').length / counted.length) * 100),
  };
}

export async function listMyOpenTasks(access: CurrentAccess, limit: number) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('tasks')
    .select('id, task_code, title, status, priority, due_date')
    .eq('assignee_id', access.employee.id)
    .not('status', 'in', closedStatuses)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
