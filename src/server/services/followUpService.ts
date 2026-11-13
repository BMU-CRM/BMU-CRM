import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { parsePage } from '@/lib/parseListParams';
import { followUpStatuses, type FollowUpStatus } from '@/lib/validation/followUpSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';

export const followUpsPerPage = 25;

export type FollowUpFilters = {
  status?: FollowUpStatus;
  search?: string;
  includePaid: boolean;
  due?: 'today' | 'overdue';
  sort: 'due' | 'overdue-desc' | 'balance-desc' | 'next';
  page: number;
};

export const followUpSorts = [
  { value: 'due', label: 'Due date' },
  { value: 'overdue-desc', label: 'Most overdue' },
  { value: 'balance-desc', label: 'Largest balance' },
  { value: 'next', label: 'Next follow-up' },
];

// The board's filters from the address, for the page and its export.
export function readFollowUpFilters(params: Record<string, string | undefined>): FollowUpFilters {
  return {
    status: followUpStatuses.find((value) => value === params.status),
    search: params.search,
    includePaid: params.status === 'payment_received' || params.paid === 'yes',
    due: params.due === 'today' || params.due === 'overdue' ? params.due : undefined,
    sort: (followUpSorts.find((sort) => sort.value === params.sort)?.value ?? 'due') as FollowUpFilters['sort'],
    page: parsePage(params.page),
  };
}

// Unpaid invoices and where each follow-up stands. The board is worked out in the
// database; it is a few hundred invoices at most, so it is sorted and paged here.
export async function getFollowUpBoard(filters: FollowUpFilters, today: string) {
  const database = await createDatabaseClient();
  const term = filters.search ? cleanSearchTerm(filters.search) : '';
  const { data, error } = await database.rpc('get_follow_up_board', {
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(term ? { p_search: term } : {}),
    p_include_paid: filters.includePaid,
  });
  if (error) throw error;

  let rows = data;
  if (filters.due === 'today') rows = rows.filter((row) => row.next_follow_up_on !== null && row.next_follow_up_on <= today);
  if (filters.due === 'overdue') rows = rows.filter((row) => row.days_overdue > 0 && row.status !== 'payment_received');
  const sorted = [...rows].sort((a, b) => {
    if (filters.sort === 'overdue-desc') return b.days_overdue - a.days_overdue;
    if (filters.sort === 'balance-desc') return Number(b.balance) - Number(a.balance);
    if (filters.sort === 'next') return (a.next_follow_up_on ?? '9999').localeCompare(b.next_follow_up_on ?? '9999');
    return a.due_date.localeCompare(b.due_date);
  });

  const from = (filters.page - 1) * followUpsPerPage;
  const open = data.filter((row) => row.status !== 'payment_received');
  return {
    all: sorted,
    rows: sorted.slice(from, from + followUpsPerPage),
    total: sorted.length,
    totals: {
      outstanding: open.reduce((sum, row) => sum + Number(row.balance), 0),
      overdue: open.filter((row) => row.days_overdue > 0).reduce((sum, row) => sum + Number(row.balance), 0),
      dueToday: open.filter((row) => row.next_follow_up_on !== null && row.next_follow_up_on <= today).length,
      promised: open.filter((row) => row.status === 'promise_to_pay').length,
    },
  };
}

export type FollowUpRow = Awaited<ReturnType<typeof getFollowUpBoard>>['rows'][number];

export async function listInvoiceFollowUps(invoiceId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('invoice_follow_ups')
    .select('id, status, note, contacted_on, next_follow_up_on, promised_amount, promised_on, created_at, author:employees(full_name)')
    .eq('invoice_id', invoiceId)
    .order('contacted_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// A payment with what its receipt prints.
export async function getPaymentReceipt(paymentId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('payments')
    .select(
      `id, amount, payment_date, method, reference, notes, receipt_number, created_at,
       invoice:invoices(id, invoice_number, title, total, amount_paid, bill_to_name, bill_to_address, client_gstin, signed_by, show_seal,
         client:clients(company_name))`,
    )
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
