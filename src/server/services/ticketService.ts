import 'server-only';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { TicketStatus } from '@/lib/validation/ticketSchema';
import type { CurrentAccess } from './accessService';

export const ticketsPerPage = 25;

const finishedStatuses = '("resolved","closed")';

export const ticketViews = ['mine', 'assigned', 'queue'] as const;
export type TicketView = (typeof ticketViews)[number];

const ticketListFields = `
  id, ticket_code, title, status, priority, created_at, updated_at, assigned_to, requester_id,
  requester:employees!tickets_requester_id_fkey(full_name),
  assignee:employees!tickets_assigned_to_fkey(full_name),
  category:ticket_categories(name)
`;

// Mirrors can_manage_ticket_row in the database, which has the final say.
export function canHandleTicket(
  access: CurrentAccess,
  ticket: { assigned_to: string | null; handling_department_id: string | null },
) {
  const scope = access.permissions[permissionKeys.ticketsManage];
  if (ticket.assigned_to === access.employee.id || scope === 'organisation') return true;
  return scope === 'department' && ticket.handling_department_id !== null && ticket.handling_department_id === access.employee.department_id;
}

type TicketFilters = { view: TicketView; search?: string; status?: TicketStatus; page: number };

export async function listTickets(access: CurrentAccess, { view, search, status, page }: TicketFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * ticketsPerPage;
  const me = access.employee.id;

  let query = database
    .from('tickets')
    .select(ticketListFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + ticketsPerPage - 1);

  if (view === 'mine') query = query.eq('requester_id', me);
  if (view === 'assigned') query = query.eq('assigned_to', me);
  if (view === 'queue') {
    // Row level security already limits this to the tickets the person handles.
    query = query.or(`requester_id.is.null,requester_id.neq.${me}`);
    if (access.permissions[permissionKeys.ticketsManage] !== 'organisation') {
      query = access.employee.department_id
        ? query.eq('handling_department_id', access.employee.department_id)
        : query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`title.ilike.%${term}%,ticket_code.ilike.%${term}%`);
  if (status) query = query.eq('status', status);
  else if (view !== 'mine') query = query.not('status', 'in', finishedStatuses);

  const { data, count, error } = await query;
  if (error) throw error;
  return { tickets: data, total: count ?? 0 };
}

export type TicketListItem = Awaited<ReturnType<typeof listTickets>>['tickets'][number];

export async function countTicketsToHandle(access: CurrentAccess) {
  if (access.permissions[permissionKeys.ticketsManage] === undefined) return { assigned: 0, unassigned: 0 };
  const database = await createDatabaseClient();

  const [assigned, unassigned] = await Promise.all([
    database
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', access.employee.id)
      .not('status', 'in', finishedStatuses),
    database.from('tickets').select('id', { count: 'exact', head: true }).is('assigned_to', null).eq('status', 'open'),
  ]);
  if (assigned.error) throw assigned.error;
  if (unassigned.error) throw unassigned.error;
  return { assigned: assigned.count ?? 0, unassigned: unassigned.count ?? 0 };
}

export async function listTicketsToHandle(access: CurrentAccess, limit: number) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tickets')
    .select(ticketListFields)
    .or(`assigned_to.eq.${access.employee.id},assigned_to.is.null`)
    .not('status', 'in', finishedStatuses)
    .neq('requester_id', access.employee.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getTicket(ticketId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tickets')
    .select(
      `*,
       requester:employees!tickets_requester_id_fkey(id, full_name),
       assignee:employees!tickets_assigned_to_fkey(id, full_name),
       requesterDepartment:departments!tickets_requester_department_id_fkey(name),
       handlingDepartment:departments!tickets_handling_department_id_fkey(name),
       category:ticket_categories(name)`,
    )
    .eq('id', ticketId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type TicketDetails = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

export async function listTicketComments(ticketId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('ticket_comments')
    .select('id, body, created_at, created_by, author:employees!ticket_comments_created_by_fkey(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at');
  if (error) throw error;
  return data;
}

// The people a ticket can be given to: its handling department, or anyone for
// organisation-wide handlers. The database applies the same rule.
export async function listTicketHandlers(access: CurrentAccess, ticket: TicketDetails) {
  const database = await createDatabaseClient();
  let query = database.from('employees').select('id, full_name').eq('is_active', true).order('full_name');

  if (access.permissions[permissionKeys.ticketsManage] !== 'organisation') {
    if (!ticket.handling_department_id) return [];
    query = query.eq('department_id', ticket.handling_department_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listTicketCategories({ includeInactive = false } = {}) {
  const database = await createDatabaseClient();
  let query = database
    .from('ticket_categories')
    .select(
      `id, name, description, is_active, sort_order, handling_department_id, default_assignee_id,
       department:departments!ticket_categories_handling_department_id_fkey(name)`,
    )
    .order('sort_order')
    .order('name');
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export type TicketCategory = Awaited<ReturnType<typeof listTicketCategories>>[number];

export async function listDepartmentOptions() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('departments').select('id, name').order('name');
  if (error) throw error;
  return data;
}
