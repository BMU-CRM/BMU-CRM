import 'server-only';
import { cache } from 'react';
import { permissionKeys, type PermissionKey } from '@/lib/access/permissionKeys';
import { buildFinanceReport, type OpenInvoice, type ReportInvoice, type ReportPayment } from '@/lib/finance/financeReport';
import type { DateRange } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';

// Mirrors finance_reach in the database, which has the final say. Used to decide which
// buttons to show.
export function hasFinanceReach(
  access: CurrentAccess,
  permission: PermissionKey,
  record: { created_by?: string | null; client?: { client_manager_id: string | null } | null },
) {
  const scope = access.permissions[permission];
  if (scope === undefined) return false;
  if (scope === 'organisation') return true;
  return (
    (record.created_by != null && record.created_by === access.employee.id) ||
    (record.client?.client_manager_id != null && record.client.client_manager_id === access.employee.id)
  );
}

export function canSeeQuotations(access: CurrentAccess) {
  return access.permissions[permissionKeys.quotationsView] !== undefined || access.permissions[permissionKeys.quotationsManage] !== undefined;
}

export function canSeeInvoices(access: CurrentAccess) {
  return access.permissions[permissionKeys.invoicesView] !== undefined || access.permissions[permissionKeys.invoicesManage] !== undefined;
}

// The clients this person may quote for or bill, with what goes on the document.
export async function listBillingClients(access: CurrentAccess, permission: PermissionKey) {
  const database = await createDatabaseClient();
  let query = database
    .from('clients')
    .select('id, company_name, address, gstin, billing_state, client_manager_id')
    .order('company_name');
  if (access.permissions[permission] !== 'organisation') query = query.eq('client_manager_id', access.employee.id);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Clients for the filters on Quotations and Invoices. Finance sees the clients it bills
// even without the Clients section.
export async function listFinanceClientOptions() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('clients').select('id, company_name').order('company_name');
  if (error) throw error;
  return data;
}

export function toClientChoices(clients: Awaited<ReturnType<typeof listBillingClients>>) {
  return clients.map((client) => ({
    value: client.id,
    label: client.company_name,
    billingState: client.billing_state,
    address: client.address,
    gstin: client.gstin,
  }));
}

// Once per request. Not shared between people: who may read it depends on their access.
export const getFinanceSettings = cache(async function loadFinanceSettings() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('finance_settings').select('*').maybeSingle();
  if (error) throw error;
  return data;
});

export type FinanceSettings = NonNullable<Awaited<ReturnType<typeof getFinanceSettings>>>;

// Row level security limits every query to the invoices this person may see.
export async function getFinanceReport(range: DateRange) {
  const database = await createDatabaseClient();

  const [issued, open, payments] = await Promise.all([
    database
      .from('invoices')
      .select('id, invoice_number, issue_date, client_id, subtotal, cgst_total, sgst_total, igst_total, tax_total, total, client:clients(company_name)')
      .in('status', ['issued', 'partially_paid', 'paid'])
      .gte('issue_date', range.from)
      .lte('issue_date', range.to),
    database
      .from('invoices')
      .select('id, invoice_number, due_date, client_id, total, amount_paid, client:clients(company_name)')
      .in('status', ['issued', 'partially_paid']),
    database
      .from('payments')
      .select('amount, payment_date, client_id, client:clients(company_name)')
      .gte('payment_date', range.from)
      .lte('payment_date', range.to),
  ]);
  if (issued.error) throw issued.error;
  if (open.error) throw open.error;
  if (payments.error) throw payments.error;

  const invoices: ReportInvoice[] = issued.data.map((invoice) => ({ ...invoice, client_name: invoice.client?.company_name ?? 'Unknown client' }));
  const openInvoices: OpenInvoice[] = open.data.map((invoice) => ({ ...invoice, client_name: invoice.client?.company_name ?? 'Unknown client' }));
  const paymentRows: ReportPayment[] = payments.data.map((payment) => ({ ...payment, client_name: payment.client?.company_name ?? null }));

  return buildFinanceReport({ range, today: todayInIndia(), invoices, openInvoices, payments: paymentRows });
}

// Every issued or cancelled invoice in the range, for the accountant's spreadsheet.
export async function listInvoicesForExport(range: DateRange) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoices')
    .select(
      `invoice_number, issue_date, due_date, status, bill_to_name, client_gstin, place_of_supply, is_inter_state,
       subtotal, cgst_total, sgst_total, igst_total, tax_total, total, amount_paid, cancel_reason,
       client:clients(company_name)`,
    )
    .neq('status', 'draft')
    .gte('issue_date', range.from)
    .lte('issue_date', range.to)
    .order('issue_date')
    .order('invoice_number');
  if (error) throw error;
  return data;
}
