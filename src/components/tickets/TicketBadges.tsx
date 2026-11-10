import { StatusBadge } from '@/components/ui/StatusBadge';
import { ticketStatusLabels, type TicketStatus } from '@/lib/validation/ticketSchema';

const statusTones: Record<TicketStatus, 'neutral' | 'good' | 'warning' | 'critical'> = {
  open: 'critical',
  assigned: 'neutral',
  in_progress: 'neutral',
  waiting_for_response: 'warning',
  resolved: 'good',
  closed: 'good',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <StatusBadge tone={statusTones[status]}>{ticketStatusLabels[status]}</StatusBadge>;
}
