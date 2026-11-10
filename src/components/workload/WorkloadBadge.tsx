import { StatusBadge } from '@/components/ui/StatusBadge';
import type { WorkloadIndicator } from '@/lib/tasks/calculateWorkload';

const indicators: Record<WorkloadIndicator, { label: string; tone: 'good' | 'warning' | 'critical' }> = {
  overloaded: { label: 'Overloaded', tone: 'critical' },
  balanced: { label: 'Balanced', tone: 'good' },
  underutilised: { label: 'Has capacity', tone: 'warning' },
};

export function WorkloadBadge({ indicator }: { indicator: WorkloadIndicator }) {
  const { label, tone } = indicators[indicator];

  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
