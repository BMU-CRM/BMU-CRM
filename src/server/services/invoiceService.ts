import 'server-only';
import { sumMoney } from '@/lib/finance/documentTotals';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import type { InvoiceStatus } from '@/lib/validation/financeSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';

export const invoicesPerPage = 25;

const invoiceListFields = `
  id, invoice_number, title, status, issue_date, due_date, total, amount_paid, created_by,
  client:clients(id, company_name)
`;

// "overdue" and "unpaid" are not stored statuses. They are worked out from the dates.
export type InvoiceFilter = InvoiceStatus | 'unpaid' | 'overdue';

type InvoiceFilters = { search?: string; status?: InvoiceFilter; clientId?: string; page: number };

export async function listInvoices({ search, status, clientId, page }: InvoiceFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * invoicesPerPage;

  let query = database
    .from('invoices')
    .select(invoiceListFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + invoicesPerPage - 1);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`title.ilike.%${term}%,invoice_number.ilike.%${term}%,bill_to_name.ilike.%${term}%`);
  if (status === 'unpaid') query = query.in('status', ['issued', 'partially_paid']);
  else if (status === 'overdue') query = query.in('status', ['issued', 'partially_paid']).lt('due_date', todayInIndia());
  else if (status) query = query.eq('status', status);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, count, error } = await query;
  if (error) throw error;
  return { invoices: data, total: count ?? 0 };
}

export type InvoiceListItem = Awaited<ReturnType<typeof listInvoices>>['invoices'][number];

export async function listClientInvoices(clientId: string, limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .select(invoiceListFields)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// What the client still owes across every issued invoice.
export async function getClientBalance(clientId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .select('total, amount_paid, due_date')
    .eq('client_id', clientId)
    .in('status', ['issued', 'partially_paid']);
  if (error) throw error;

  const today = todayInIndia();
  return {
    outstanding: sumMoney(data.map((invoice) => invoice.total - invoice.amount_paid)),
    overdue: sumMoney(data.filter((invoice) => invoice.due_date < today).map((invoice) => invoice.total - invoice.amount_paid)),
  };
}

export async function listOverdueInvoices(limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .select(invoiceListFields)
    .in('status', ['issued', 'partially_paid'])
    .lt('due_date', todayInIndia())
    .order('due_date')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getInvoice(invoiceId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .select(
      `*,
       client:clients(id, company_name, client_manager_id),
       project:projects(id, name),
       quotation:quotations!invoices_quotation_id_fkey(id, quotation_number),
       author:employees!invoices_created_by_fkey(full_name)`,
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type InvoiceDetails = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

export async function listInvoiceItems(invoiceId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoice_items')
    .select('id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount, service_group, service_name, billing')
    .eq('invoice_id', invoiceId)
    .order('position');
  if (error) throw error;
  return data;
}

export async function listInvoicePayments(invoiceId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payments')
    .select('id, amount, payment_date, method, reference, notes, receipt_number, created_at, recorder:employees!payments_recorded_by_fkey(full_name)')
    .eq('invoice_id', invoiceId)
    .order('payment_date')
    .order('created_at');
  if (error) throw error;
  return data;
}
