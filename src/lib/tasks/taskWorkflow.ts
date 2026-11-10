import type { Database } from '@/types/databaseTypes';

export type TaskStatus = Database['public']['Enums']['task_status'];
export type WorkPriority = Database['public']['Enums']['work_priority'];

export const taskStatusLabels: Record<TaskStatus, string> = {
  not_started: 'Not started',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In progress',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  on_hold: 'On hold',
  completed: 'Completed',
  rejected: 'Rejected',
};

export const priorityLabels: Record<WorkPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const closedStatuses: TaskStatus[] = ['completed', 'rejected'];

export function isTaskOpen(status: TaskStatus) {
  return !closedStatuses.includes(status);
}

// Overdue is worked out, not stored, so a task keeps its real status.
export function isTaskOverdue(task: { status: TaskStatus; due_date: string | null }, today: string) {
  return isTaskOpen(task.status) && task.due_date !== null && task.due_date < today;
}

export type TaskActor = {
  isAssignee: boolean;
  isSelfTask: boolean;
  hasReviewer: boolean;
  canManage: boolean;
  canReview: boolean;
};

export type TaskAction = {
  status: TaskStatus;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  // Asks for a reason, which is saved as a comment.
  needsNote?: boolean;
  // Asks the reviewer to rate the work.
  needsRating?: boolean;
};

// Mirrors guard_task_update, so the page offers only what the database will accept.
export function getTaskActions(status: TaskStatus, actor: TaskActor): TaskAction[] {
  const actions: TaskAction[] = [];

  if (actor.isAssignee) {
    if (status === 'assigned') {
      actions.push({ status: 'accepted', label: 'Accept', tone: 'primary' });
      actions.push({ status: 'rejected', label: 'Reject', tone: 'danger', needsNote: true });
    }
    if (status === 'accepted') actions.push({ status: 'in_progress', label: 'Start work', tone: 'primary' });
    if (status === 'in_progress') {
      if (actor.isSelfTask && !actor.hasReviewer) {
        actions.push({ status: 'completed', label: 'Mark complete', tone: 'primary' });
      } else {
        actions.push({ status: 'under_review', label: 'Submit for review', tone: 'primary' });
      }
    }
    if (status === 'on_hold' || status === 'changes_requested') {
      actions.push({ status: 'in_progress', label: 'Resume work', tone: 'primary' });
    }
  }

  if (actor.canReview && status === 'under_review') {
    actions.push({ status: 'completed', label: 'Approve', tone: 'primary', needsRating: true });
    actions.push({ status: 'changes_requested', label: 'Request changes', tone: 'danger', needsNote: true });
  }

  const canPause = actor.canManage || (actor.isAssignee && (status === 'accepted' || status === 'in_progress'));

  if (canPause && isTaskOpen(status) && status !== 'on_hold') {
    actions.push({ status: 'on_hold', label: 'Put on hold', tone: 'secondary', needsNote: true });
  }
  if (actor.canManage && !actor.isAssignee && status === 'on_hold') {
    actions.push({ status: 'in_progress', label: 'Resume work', tone: 'primary' });
  }
  if (actor.canManage && status === 'completed') {
    actions.push({ status: 'in_progress', label: 'Reopen', tone: 'secondary', needsNote: true });
  }

  return actions;
}
