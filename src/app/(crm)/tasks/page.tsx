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
    assignee?: string;
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
  const page = parsePage(params.page);

  // Looking at someone else's or a department's work only makes sense across all tasks.
  const oversight = view === 'all' || view === 'assigned' ? await listTaskOversightOptions(access) : null;
  const assigneeId = oversight ? (parseId(params.assignee) ?? undefined) : undefined;
  const departmentId = oversight ? (parseId(params.department) ?? undefined) : undefined;

  const [{ tasks, total }, stats] = await Promise.all([
    listTasks(access, { view, search: params.search, status, stage, priority, overdue, assigneeId, departmentId, page }),
    getTaskStats(access),
  ]);

  const canCreate = access.permissions[permissionKeys.tasksCreate] !== undefined;
  const isFiltered = Boolean(params.search || status || stage || priority || overdue || assigneeId || departmentId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ view, page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    if (stage) query.set('stage', stage);
    if (priority) query.set('priority', priority);
    if (overdue) query.set('overdue', '1');
    if (assigneeId) query.set('assignee', assigneeId);
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
        values={{ search: params.search, status, stage, priority, overdue, assigneeId, departmentId }}
        oversight={oversight}
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
