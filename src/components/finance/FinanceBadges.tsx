import { StatusBadge } from '@/components/ui/StatusBadge';
import { isOverdue } from '@/lib/finance/invoiceDue';
import { todayInIndia } from '@/lib/formatDate';
import {
  invoiceStatusLabels,
  quotationStatusLabels,
  type InvoiceStatus,
  type QuotationStatus,
} from '@/lib/validation/financeSchema';

type Tone = 'neutral' | 'good' | 'warning' | 'critical';

const quotationTones: Record<QuotationStatus, Tone> = {
  draft: 'neutral',
  final: 'neutral',
  sent: 'warning',
  accepted: 'good',
  declined: 'critical',
};

const invoiceTones: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  issued: 'warning',
  partially_paid: 'warning',
  paid: 'good',
  cancelled: 'neutral',
};

export function QuotationStatusBadge({ status, validUntil }: { status: QuotationStatus; validUntil?: string }) {
  if (status === 'sent' && validUntil && validUntil < todayInIndia()) {
    return <StatusBadge tone="critical">Expired</StatusBadge>;
  }
  return <StatusBadge tone={quotationTones[status]}>{quotationStatusLabels[status]}</StatusBadge>;
}

export function InvoiceStatusBadge({ status, dueDate }: { status: InvoiceStatus; dueDate: string }) {
  return (
    <>
      <StatusBadge tone={invoiceTones[status]}>{invoiceStatusLabels[status]}</StatusBadge>
      {isOverdue({ status, due_date: dueDate }) && <StatusBadge tone="critical">Overdue</StatusBadge>}
    </>
  );
}
