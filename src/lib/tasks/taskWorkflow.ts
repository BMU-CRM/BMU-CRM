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

// Where work stands, in plain terms, for people overseeing others' tasks.
export const taskStages = {
  todo: { label: 'Yet to start', statuses: ['not_started', 'assigned', 'accepted'] },
  doing: { label: 'Being worked on', statuses: ['in_progress', 'changes_requested', 'on_hold'] },
  review: { label: 'Waiting for review', statuses: ['under_review'] },
  done: { label: 'Done', statuses: ['completed'] },
} as const satisfies Record<string, { label: string; statuses: TaskStatus[] }>;

export type TaskStage = keyof typeof taskStages;

export function isTaskStage(value: string | undefined): value is TaskStage {
  return value !== undefined && Object.hasOwn(taskStages, value);
}

export function stageOf(status: TaskStatus): TaskStage | null {
  for (const [stage, { statuses }] of Object.entries(taskStages)) {
    if ((statuses as readonly TaskStatus[]).includes(status)) return stage as TaskStage;
  }
  return null;
}

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
  // Offers a field for a link to the finished work, such as a Google Drive folder.
  acceptsWorkLink?: boolean;
  // Not a change of status: asks the assignee to resume an on-hold task, with an
  // optional note. The task stays on hold until they do.
  requestsResume?: boolean;
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
        actions.push({ status: 'completed', label: 'Mark complete', tone: 'primary', acceptsWorkLink: true });
      } else {
        actions.push({ status: 'under_review', label: 'Submit for review', tone: 'primary', acceptsWorkLink: true });
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
  // Only the person doing the work resumes it, which starts their hours. A manager asks
  // them to, and reopened work goes back to them as changes requested.
  if (actor.canManage && !actor.isAssignee && status === 'on_hold') {
    actions.push({ status: 'on_hold', label: 'Ask to resume', tone: 'primary', requestsResume: true });
  }
  if (actor.canManage && status === 'completed') {
    actions.push({ status: 'changes_requested', label: 'Reopen', tone: 'secondary', needsNote: true });
  }

  return actions;
}
