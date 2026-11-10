import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  isTaskOverdue,
  priorityLabels,
  taskStatusLabels,
  type TaskStatus,
  type WorkPriority,
} from '@/lib/tasks/taskWorkflow';

const statusTones: Record<TaskStatus, 'neutral' | 'good' | 'warning' | 'critical'> = {
  not_started: 'neutral',
  assigned: 'neutral',
  accepted: 'neutral',
  in_progress: 'neutral',
  under_review: 'warning',
  changes_requested: 'warning',
  on_hold: 'warning',
  completed: 'good',
  rejected: 'critical',
};

type TaskStatusBadgeProps = {
  status: TaskStatus;
  dueDate: string | null;
  today: string;
};

export function TaskStatusBadge({ status, dueDate, today }: TaskStatusBadgeProps) {
  return (
    <>
      <StatusBadge tone={statusTones[status]}>{taskStatusLabels[status]}</StatusBadge>{' '}
      {isTaskOverdue({ status, due_date: dueDate }, today) && <StatusBadge tone="critical">Overdue</StatusBadge>}
    </>
  );
}

export function PriorityBadge({ priority }: { priority: WorkPriority }) {
  const tone = priority === 'urgent' ? 'critical' : priority === 'high' ? 'warning' : 'neutral';

  return <StatusBadge tone={tone}>{priorityLabels[priority]}</StatusBadge>;
}
