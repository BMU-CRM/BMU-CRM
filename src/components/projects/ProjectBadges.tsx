import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  projectHealthLabels,
  projectStatusLabels,
  type ProjectHealth,
  type ProjectStatus,
} from '@/lib/projects/projectHealth';

const healthTones: Record<ProjectHealth, 'neutral' | 'good' | 'warning' | 'critical'> = {
  on_track: 'good',
  at_risk: 'warning',
  delayed: 'critical',
  closed: 'neutral',
};

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  return <StatusBadge tone={healthTones[health]}>{projectHealthLabels[health]}</StatusBadge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusBadge>{projectStatusLabels[status]}</StatusBadge>;
}
