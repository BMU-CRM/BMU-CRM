import { StatusBadge } from '@/components/ui/StatusBadge';
import { resignationStatusLabels } from '@/lib/validation/exitSchema';

const tones: Record<string, 'neutral' | 'good' | 'warning' | 'critical'> = {
  submitted: 'warning',
  approved: 'good',
  rejected: 'critical',
  withdrawn: 'neutral',
  completed: 'neutral',
};

export function ResignationStatusBadge({ status }: { status: string }) {
  return <StatusBadge tone={tones[status]}>{resignationStatusLabels[status] ?? status}</StatusBadge>;
}
