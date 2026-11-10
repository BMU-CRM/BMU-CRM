import { StatusBadge } from '@/components/ui/StatusBadge';
import { clientStatusLabels, type ClientStatus } from '@/lib/validation/clientSchema';

const tones: Record<ClientStatus, 'neutral' | 'good' | 'warning' | 'critical'> = {
  lead: 'neutral',
  onboarding: 'warning',
  active: 'good',
  on_hold: 'warning',
  inactive: 'critical',
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <StatusBadge tone={tones[status]}>{clientStatusLabels[status]}</StatusBadge>;
}
