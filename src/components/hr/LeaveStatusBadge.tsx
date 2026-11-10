import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Database } from '@/types/databaseTypes';

type LeaveStatus = Database['public']['Enums']['leave_status'];

const badges: Record<LeaveStatus, { label: string; tone: 'neutral' | 'good' | 'warning' | 'critical' }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { label, tone } = badges[status];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
