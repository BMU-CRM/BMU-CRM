import Link from 'next/link';
import styles from '@/components/ui/DataTable.module.css';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import type { TaskListItem } from '@/server/services/taskService';
import { PriorityBadge, TaskStatusBadge } from './TaskBadges';

export function TaskTable({ tasks }: { tasks: TaskListItem[] }) {
  const today = todayInIndia();

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Assigned to</th>
            <th scope="col">Assigned by</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Due</th>
            <th scope="col" className={styles.numeric}>
              Progress
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <Link href={`/tasks/${task.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {task.title}
                </Link>
                <p className={styles.secondaryText}>
                  {[task.task_code, task.parent_task_id ? 'Subtask' : null, task.project?.name, task.clientName]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </td>
              <td>{task.assignee?.full_name ?? 'Unassigned'}</td>
              <td>{task.creator?.full_name ?? 'System'}</td>
              <td>
                <TaskStatusBadge status={task.status} dueDate={task.due_date} today={today} />
              </td>
              <td>
                <PriorityBadge priority={task.priority} />
              </td>
              <td>{task.due_date ? formatDate(task.due_date) : '—'}</td>
              <td className={styles.numeric}>{task.completion_percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
