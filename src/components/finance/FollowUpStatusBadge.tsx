import { StatusBadge } from '@/components/ui/StatusBadge';
import { followUpStatusLabels, type FollowUpStatus } from '@/lib/validation/followUpSchema';

const tones = { not_contacted: 'critical', pending: 'warning', contacted: 'neutral', promise_to_pay: 'warning', payment_received: 'good' } as const;

export function FollowUpStatusBadge({ status }: { status: FollowUpStatus }) {
  return <StatusBadge tone={tones[status]}>{followUpStatusLabels[status]}</StatusBadge>;
}
