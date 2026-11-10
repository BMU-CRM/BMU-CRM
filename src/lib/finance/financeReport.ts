import { sumMoney } from './documentTotals';
import { daysBetween, monthLabel, monthsInRange, type DateRange } from './financialPeriods';

// Builds the finance report from plain rows, so it can be tested without a database.
// Only issued invoices are counted: drafts are not sales yet, and cancelled ones never were.

export type ReportInvoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  client_id: string;
  client_name: string;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  tax_total: number;
  total: number;
};

export type OpenInvoice = {
  id: string;
  invoice_number: string | null;
  due_date: string;
  client_id: string;
  client_name: string;
  total: number;
  amount_paid: number;
};

export type ReportPayment = {
  amount: number;
  payment_date: string;
  client_id: string | null;
  client_name: string | null;
};

export const ageingBuckets = [
  { key: 'current', label: 'Not due yet', from: Number.NEGATIVE_INFINITY, to: 0 },
  { key: '1-30', label: '1 to 30 days late', from: 1, to: 30 },
  { key: '31-60', label: '31 to 60 days late', from: 31, to: 60 },
  { key: '61-90', label: '61 to 90 days late', from: 61, to: 90 },
  { key: '90+', label: 'Over 90 days late', from: 91, to: Number.POSITIVE_INFINITY },
] as const;

type ReportInput = {
  range: DateRange;
  today: string;
  invoices: ReportInvoice[];
  openInvoices: OpenInvoice[];
  payments: ReportPayment[];
};

const balanceOf = (invoice: OpenInvoice) => sumMoney([invoice.total, -invoice.amount_paid]);

export function buildFinanceReport({ range, today, invoices, openInvoices, payments }: ReportInput) {
  const inRange = invoices.filter((invoice) => invoice.issue_date >= range.from && invoice.issue_date <= range.to);
  const paid = payments.filter((payment) => payment.payment_date >= range.from && payment.payment_date <= range.to);
  const overdue = openInvoices.filter((invoice) => invoice.due_date < today);

  const summary = {
    invoiced: sumMoney(inRange.map((invoice) => invoice.total)),
    invoiceCount: inRange.length,
    taxable: sumMoney(inRange.map((invoice) => invoice.subtotal)),
    gst: sumMoney(inRange.map((invoice) => invoice.tax_total)),
    collected: sumMoney(paid.map((payment) => payment.amount)),
    outstanding: sumMoney(openInvoices.map(balanceOf)),
    outstandingCount: openInvoices.length,
    overdue: sumMoney(overdue.map(balanceOf)),
    overdueCount: overdue.length,
  };

  const months = monthsInRange(range).map((month) => {
    const issued = inRange.filter((invoice) => invoice.issue_date.startsWith(month));
    return {
      month,
      label: monthLabel(month),
      invoiceCount: issued.length,
      taxable: sumMoney(issued.map((invoice) => invoice.subtotal)),
      cgst: sumMoney(issued.map((invoice) => invoice.cgst_total)),
      sgst: sumMoney(issued.map((invoice) => invoice.sgst_total)),
      igst: sumMoney(issued.map((invoice) => invoice.igst_total)),
      tax: sumMoney(issued.map((invoice) => invoice.tax_total)),
      invoiced: sumMoney(issued.map((invoice) => invoice.total)),
      collected: sumMoney(paid.filter((payment) => payment.payment_date.startsWith(month)).map((payment) => payment.amount)),
    };
  });

  const ageing = ageingBuckets.map((bucket) => {
    const matching = openInvoices.filter((invoice) => {
      const late = daysBetween(invoice.due_date, today);
      return late >= bucket.from && late <= bucket.to;
    });
    return { key: bucket.key, label: bucket.label, count: matching.length, amount: sumMoney(matching.map(balanceOf)) };
  });

  const clientTotals = new Map<string, { clientId: string; name: string; invoiced: number; collected: number; outstanding: number }>();
  const entryFor = (clientId: string, name: string) => {
    let entry = clientTotals.get(clientId);
    if (!entry) {
      entry = { clientId, name, invoiced: 0, collected: 0, outstanding: 0 };
      clientTotals.set(clientId, entry);
    }
    return entry;
  };
  for (const invoice of inRange) {
    const entry = entryFor(invoice.client_id, invoice.client_name);
    entry.invoiced = sumMoney([entry.invoiced, invoice.total]);
  }
  for (const payment of paid) {
    if (!payment.client_id) continue;
    const entry = entryFor(payment.client_id, payment.client_name ?? 'Unknown client');
    entry.collected = sumMoney([entry.collected, payment.amount]);
  }
  for (const invoice of openInvoices) {
    const entry = entryFor(invoice.client_id, invoice.client_name);
    entry.outstanding = sumMoney([entry.outstanding, balanceOf(invoice)]);
  }
  const clients = [...clientTotals.values()]
    .sort((first, second) => second.invoiced - first.invoiced || second.outstanding - first.outstanding || first.name.localeCompare(second.name))
    .slice(0, 10);

  return { summary, months, ageing, clients };
}

export type FinanceReport = ReturnType<typeof buildFinanceReport>;
