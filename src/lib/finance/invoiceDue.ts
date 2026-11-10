import { todayInIndia } from '@/lib/formatDate';
import type { InvoiceStatus } from '@/lib/validation/financeSchema';
import { sumMoney } from './documentTotals';

type InvoiceMoney = { status: InvoiceStatus; due_date: string; total: number; amount_paid: number };

export function isUnpaid(status: InvoiceStatus) {
  return status === 'issued' || status === 'partially_paid';
}

// Overdue is not stored. It is worked out from the due date, so the status stays true.
export function isOverdue(invoice: Pick<InvoiceMoney, 'status' | 'due_date'>, today = todayInIndia()) {
  return isUnpaid(invoice.status) && invoice.due_date < today;
}

export function balanceDue(invoice: Pick<InvoiceMoney, 'status' | 'total' | 'amount_paid'>) {
  return isUnpaid(invoice.status) ? sumMoney([invoice.total, -invoice.amount_paid]) : 0;
}
