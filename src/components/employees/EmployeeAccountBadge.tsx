import { StatusBadge } from '@/components/ui/StatusBadge';

type EmployeeAccountBadgeProps = {
  isActive: boolean;
  inviteAcceptedAt: string | null;
};

export function EmployeeAccountBadge({ isActive, inviteAcceptedAt }: EmployeeAccountBadgeProps) {
  if (!isActive) return <StatusBadge tone="critical">Inactive</StatusBadge>;
  if (!inviteAcceptedAt) return <StatusBadge tone="warning">Invited</StatusBadge>;
  return <StatusBadge tone="good">Active</StatusBadge>;
}
