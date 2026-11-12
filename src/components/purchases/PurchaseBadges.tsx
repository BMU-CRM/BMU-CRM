import { StatusBadge } from '@/components/ui/StatusBadge';
import { purchaseOrderStatusLabels, vendorBillStatus, vendorBillStatusLabels, type PurchaseOrderStatus } from '@/lib/validation/purchaseSchema';

const orderTones = { draft: 'neutral', issued: 'warning', received: 'good', cancelled: 'critical' } as const;

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <StatusBadge tone={orderTones[status]}>{purchaseOrderStatusLabels[status]}</StatusBadge>;
}

// Paid, part paid or unpaid, and overdue when it is past its due date.
export function VendorBillStatusBadge({ amount, paid, dueDate, today }: { amount: number; paid: number; dueDate: string; today: string }) {
  const status = vendorBillStatus(amount, paid);
  if (status !== 'paid' && dueDate < today) return <StatusBadge tone="critical">Overdue{status === 'part_paid' ? ', part paid' : ''}</StatusBadge>;
  return <StatusBadge tone={status === 'paid' ? 'good' : 'warning'}>{vendorBillStatusLabels[status]}</StatusBadge>;
}
