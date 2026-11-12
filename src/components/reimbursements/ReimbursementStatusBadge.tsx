import { StatusBadge } from '@/components/ui/StatusBadge';
import { reimbursementStatusLabels, type ReimbursementStatus } from '@/lib/validation/reimbursementSchema';

const tones = { submitted: 'warning', approved: 'neutral', rejected: 'critical', paid: 'good', cancelled: 'neutral' } as const;

export function ReimbursementStatusBadge({ status }: { status: ReimbursementStatus }) {
  return <StatusBadge tone={tones[status]}>{reimbursementStatusLabels[status]}</StatusBadge>;
}
