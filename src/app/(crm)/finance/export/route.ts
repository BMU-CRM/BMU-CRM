import { permissionKeys } from '@/lib/access/permissionKeys';
import { isCalendarDate } from '@/lib/calendar/calendarRange';
import { periodRange } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { invoiceStatusLabels } from '@/lib/validation/financeSchema';
import { getActionAccess } from '@/server/services/accessService';
import { listInvoicesForExport } from '@/server/services/financeService';

// A cell that starts with = + - @ could run as a formula in a spreadsheet, so it is
// prefixed with an apostrophe. Numbers are written as plain digits.
function cell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toFixed(2);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const access = await getActionAccess(permissionKeys.financeReports);
  if (!access) return new Response('Not found', { status: 404 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const range =
    isCalendarDate(from) && isCalendarDate(to) && from <= to ? { from, to } : periodRange('this-year', todayInIndia());

  const invoices = await listInvoicesForExport(range);

  const header = [
    'Invoice number', 'Invoice date', 'Due date', 'Status', 'Client', 'Billed to', 'Client GSTIN', 'Place of supply',
    'Supply', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice total', 'Received', 'Cancellation reason',
  ];
  const rows = invoices.map((invoice) => [
    cell(invoice.invoice_number),
    cell(invoice.issue_date),
    cell(invoice.due_date),
    cell(invoiceStatusLabels[invoice.status]),
    cell(invoice.client?.company_name),
    cell(invoice.bill_to_name),
    cell(invoice.client_gstin),
    cell(invoice.place_of_supply),
    cell(invoice.is_inter_state ? 'Inter-state' : 'Intra-state'),
    cell(invoice.status === 'cancelled' ? 0 : invoice.subtotal),
    cell(invoice.status === 'cancelled' ? 0 : invoice.cgst_total),
    cell(invoice.status === 'cancelled' ? 0 : invoice.sgst_total),
    cell(invoice.status === 'cancelled' ? 0 : invoice.igst_total),
    cell(invoice.status === 'cancelled' ? 0 : invoice.tax_total),
    cell(invoice.status === 'cancelled' ? 0 : invoice.total),
    cell(invoice.amount_paid),
    cell(invoice.cancel_reason),
  ]);

  const csv = [header.map(cell), ...rows].map((row) => row.join(',')).join('\r\n');

  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-${range.from}-to-${range.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
