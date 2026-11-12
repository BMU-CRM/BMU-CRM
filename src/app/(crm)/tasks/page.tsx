import { ListChecks, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TaskLiveRefresh } from '@/components/tasks/TaskLiveRefresh';
import { TaskTable } from '@/components/tasks/TaskTable';
import { TaskViewTabs } from '@/components/tasks/TaskViewTabs';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId, parsePage } from '@/lib/parseListParams';
import {
  isTaskStage,
  priorityLabels,
  taskStatusLabels,
  type TaskStatus,
  type WorkPriority,
} from '@/lib/tasks/taskWorkflow';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import {
  getTaskStats,
  listTaskOversightOptions,
  listTasks,
  taskViews,
  tasksPerPage,
  type TaskView,
} from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Tasks' };

const emptyMessages: Record<TaskView, { title: string; description: string }> = {
  mine: { title: 'Nothing on your plate', description: 'Tasks assigned to you appear here.' },
  assigned: { title: 'No open tasks', description: 'Tasks you give to others appear here.' },
  review: { title: 'Nothing to review', description: 'Work waiting for your sign-off appears here.' },
  all: { title: 'No tasks yet', description: 'Every task you can see appears here.' },
};

type TasksPageProps = {
  searchParams: Promise<{
    view?: string;
    search?: string;
    status?: string;
    stage?: string;
    priority?: string;
    overdue?: string;
    dueFrom?: string;
    dueTo?: string;
    assignee?: string;
    creator?: string;
    department?: string;
    page?: string;
  }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const access = await requirePagePermission(permissionKeys.tasksView);
  const params = await searchParams;

  const view = taskViews.find((option) => option === params.view) ?? 'mine';
  const status = params.status && params.status in taskStatusLabels ? (params.status as TaskStatus) : undefined;
  const stage = isTaskStage(params.stage) ? params.stage : undefined;
  const priority = params.priority && params.priority in priorityLabels ? (params.priority as WorkPriority) : undefined;
  const overdue = params.overdue === '1';
  const isDate = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined);
  const dueFrom = isDate(params.dueFrom);
  const dueTo = isDate(params.dueTo);
  const page = parsePage(params.page);

  // Looking at someone else's or a department's work only makes sense across all tasks.
  const oversight = view === 'all' || view === 'assigned' ? await listTaskOversightOptions(access) : null;
  const assigneeId = oversight ? (parseId(params.assignee) ?? undefined) : undefined;
  // "Assigned by" is offered wherever the list holds work from more than one person.
  const creatorId = view !== 'assigned' ? (parseId(params.creator) ?? undefined) : undefined;
  const departmentId = oversight ? (parseId(params.department) ?? undefined) : undefined;

  const [{ tasks, total }, stats, people] = await Promise.all([
    listTasks(access, { view, search: params.search, status, stage, priority, overdue, dueFrom, dueTo, assigneeId, creatorId, departmentId, page }),
    getTaskStats(access),
    view !== 'assigned' ? listEmployeeOptions() : Promise.resolve([]),
  ]);

  const canCreate = access.permissions[permissionKeys.tasksCreate] !== undefined;
  const isFiltered = Boolean(params.search || status || stage || priority || overdue || dueFrom || dueTo || assigneeId || creatorId || departmentId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ view, page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    if (stage) query.set('stage', stage);
    if (priority) query.set('priority', priority);
    if (overdue) query.set('overdue', '1');
    if (dueFrom) query.set('dueFrom', dueFrom);
    if (dueTo) query.set('dueTo', dueTo);
    if (assigneeId) query.set('assignee', assigneeId);
    if (creatorId) query.set('creator', creatorId);
    if (departmentId) query.set('department', departmentId);
    return `/tasks?${query.toString()}`;
  }

  return (
    <>
      <TaskLiveRefresh />
      <PageHeader
        title="Tasks"
        description={`${stats.open} open · ${stats.overdue} overdue`}
        actions={
          canCreate && (
            <ButtonLink href="/tasks/new" variant="primary">
              <Plus size={16} aria-hidden="true" />
              New task
            </ButtonLink>
          )
        }
      />
      <TaskViewTabs current={view} reviewCount={stats.toReview} />
      <TaskFilters
        view={view}
        values={{ search: params.search, status, stage, priority, overdue, dueFrom, dueTo, assigneeId, creatorId, departmentId }}
        oversight={oversight}
        creators={view !== 'assigned' ? people.map((person) => ({ value: person.id, label: person.full_name })) : undefined}
      />
      <Panel flush>
        {tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={isFiltered ? 'No matching tasks' : emptyMessages[view].title}
            description={isFiltered ? 'Try different filters.' : emptyMessages[view].description}
          />
        ) : (
          <>
            <TaskTable tasks={tasks} showAssignee={access.permissions[permissionKeys.tasksView] !== 'own'} />
            <PaginationBar page={page} perPage={tasksPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
