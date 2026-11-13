import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import type { QuotationStatus } from '@/lib/validation/financeSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';

export const quotationsPerPage = 25;

const quotationListFields = `
  id, quotation_number, title, status, issue_date, valid_until, total, invoice_id, created_by,
  client:clients(id, company_name)
`;

// "expired" is not stored: it is a sent quotation past its valid-until date.
export type QuotationFilter = QuotationStatus | 'expired';

type QuotationFilters = { search?: string; status?: QuotationFilter; clientId?: string; page: number };

export async function listQuotations({ search, status, clientId, page }: QuotationFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * quotationsPerPage;

  let query = database
    .from('quotations')
    .select(quotationListFields, { count: 'exact' })
    .order('issue_date', { ascending: false })
    .order('quotation_number', { ascending: false })
    .range(from, from + quotationsPerPage - 1);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`title.ilike.%${term}%,quotation_number.ilike.%${term}%,bill_to_name.ilike.%${term}%`);
  if (status === 'expired') query = query.eq('status', 'sent').lt('valid_until', todayInIndia());
  else if (status) query = query.eq('status', status);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, count, error } = await query;
  if (error) throw error;
  return { quotations: data, total: count ?? 0 };
}

export type QuotationListItem = Awaited<ReturnType<typeof listQuotations>>['quotations'][number];

export async function listClientQuotations(clientId: string, limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('quotations')
    .select(quotationListFields)
    .eq('client_id', clientId)
    .order('issue_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Sent quotations still waiting for the client's answer.
export async function listAwaitingQuotations(limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('quotations')
    .select(quotationListFields)
    .eq('status', 'sent')
    .order('valid_until')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getQuotation(quotationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('quotations')
    .select(
      `*,
       client:clients(id, company_name, client_manager_id),
       project:projects(id, name),
       author:employees!quotations_created_by_fkey(full_name),
       invoice:invoices!quotations_invoice_id_fkey(id, invoice_number, status)`,
    )
    .eq('id', quotationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type QuotationDetails = NonNullable<Awaited<ReturnType<typeof getQuotation>>>;

export async function listQuotationItems(quotationId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('quotation_items')
    .select('id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount, service_group, service_name, billing')
    .eq('quotation_id', quotationId)
    .order('position');
  if (error) throw error;
  return data;
}
