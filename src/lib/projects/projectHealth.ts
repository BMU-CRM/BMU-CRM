import type { Database } from '@/types/databaseTypes';

export type ProjectStatus = Database['public']['Enums']['project_status'];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type ProjectHealth = 'on_track' | 'at_risk' | 'delayed' | 'closed';

export const projectHealthLabels: Record<ProjectHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  delayed: 'Delayed',
  closed: 'Closed',
};

type ProjectHealthInput = {
  status: ProjectStatus;
  dueDate: string | null;
  overdueTasks: number;
};

export function getProjectHealth({ status, dueDate, overdueTasks }: ProjectHealthInput, today: string): ProjectHealth {
  if (status === 'completed' || status === 'cancelled') return 'closed';
  if (dueDate !== null && dueDate < today) return 'delayed';
  return overdueTasks > 0 ? 'at_risk' : 'on_track';
}

export function progressPercentage(completedTasks: number, totalTasks: number) {
  return totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
}
