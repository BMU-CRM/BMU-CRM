import { ListChecks } from 'lucide-react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { PriorityBadge, TaskStatusBadge } from '@/components/tasks/TaskBadges';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import type { CurrentAccess } from '@/server/services/accessService';
import { listMyOpenTasks } from '@/server/services/taskService';

export async function MyTasksWidget({ access }: { access: CurrentAccess }) {
  const tasks = await listMyOpenTasks(access, 6);
  const today = todayInIndia();

  return (
    <Panel title="My tasks" action={<ButtonLink href="/tasks" variant="ghost">View all</ButtonLink>} flush>
      {tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing on your plate" description="Tasks assigned to you appear here." />
      ) : (
        <ul className={layout.list}>
          {tasks.map((task) => (
            <li key={task.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/tasks/${task.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {task.title}
                </Link>
                <p className={layout.muted}>{task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}</p>
              </div>
              <span className={layout.badges}>
                <PriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} dueDate={task.due_date} today={today} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
