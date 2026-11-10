import 'server-only';
import { permissionKeys } from '@/lib/access/permissionKeys';
import type { CurrentAccess } from './accessService';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { todayInIndia } from '@/lib/formatDate';
import type { ClientStatus } from '@/lib/validation/clientSchema';

export const clientsPerPage = 25;

const clientFields = `
  id, client_code, company_name, contact_person, email, phone, address, industry, website,
  status, onboarding_date, next_follow_up_date, important_notes, client_manager_id, department_id,
  gstin, billing_state, industry_id, created_at,
  industryRef:industries(name),
  manager:employees!clients_client_manager_id_fkey(id, full_name),
  department:departments(name)
`;

type ClientFilters = {
  search?: string;
  status?: ClientStatus;
  managerId?: string;
  industryId?: string;
  // A service (such as Web & AI) and a sub service (such as Website Design).
  serviceGroupId?: string;
  serviceId?: string;
  page: number;
};

// Clients currently taking any of these sub services, not ones whose service has ended.
async function clientsTaking(subServiceIds: string[]) {
  if (subServiceIds.length === 0) return [];
  const database = await createDatabaseClient();
  const { data, error } = await database.from('client_services').select('client_id').in('service_id', subServiceIds).neq('status', 'ended');
  if (error) throw error;
  return [...new Set(data.map((row) => row.client_id))];
}

export async function listClients({ search, status, managerId, industryId, serviceGroupId, serviceId, page }: ClientFilters) {
  const database = await createDatabaseClient();
  const from = (page - 1) * clientsPerPage;

  let serviceClientIds: string[] | null = null;
  if (serviceGroupId) {
    const { data, error } = await database.from('services').select('id').eq('group_id', serviceGroupId);
    if (error) throw error;
    serviceClientIds = await clientsTaking(data.map((row) => row.id));
  }
  if (serviceId) {
    const taking = await clientsTaking([serviceId]);
    serviceClientIds = serviceClientIds ? serviceClientIds.filter((id) => taking.includes(id)) : taking;
  }

  let query = database
    .from('clients')
    .select(clientFields, { count: 'exact' })
    .order('company_name')
    .range(from, from + clientsPerPage - 1);

  const term = search ? cleanSearchTerm(search) : '';
  if (term) {
    query = query.or(
      `company_name.ilike.%${term}%,contact_person.ilike.%${term}%,email.ilike.%${term}%,client_code.ilike.%${term}%`,
    );
  }
  if (status) query = query.eq('status', status);
  if (managerId) query = query.eq('client_manager_id', managerId);
  if (industryId) query = query.eq('industry_id', industryId);
  if (serviceClientIds) query = query.in('id', serviceClientIds.length ? serviceClientIds : ['00000000-0000-0000-0000-000000000000']);

  const { data, count, error } = await query;
  if (error) throw error;

  return { clients: data, total: count ?? 0 };
}

export async function getClient(clientId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database.from('clients').select(clientFields).eq('id', clientId).maybeSingle();

  if (error) throw error;
  return data;
}

export type ClientDetails = NonNullable<Awaited<ReturnType<typeof getClient>>>;

export async function canUpdateClient(clientId: string) {
  const database = await createDatabaseClient();
  const { data } = await database.rpc('can_update_client', { p_client: clientId });
  return data === true;
}

export async function listClientRecords(clientId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('client_records')
    .select('id, kind, title, body, rating, due_date, completed_at, created_at, author:employees(full_name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export type ClientRecord = Awaited<ReturnType<typeof listClientRecords>>[number];

export async function listClientServices(clientId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('client_services')
    .select('id, service_id, service_name, status, start_date, end_date, service:services(group:service_groups(name))')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getClientTimeline(clientId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_client_timeline', { p_client: clientId, p_limit: 50 });

  if (error) throw error;
  return data;
}

// Clients to link work to. Only people with the Clients section choose clients. Anyone
// editing a record keeps its current client, shown by name, so saving never removes it.
export async function listClientOptions(access: CurrentAccess, keepClientId?: string | null) {
  const database = await createDatabaseClient();
  let options: { id: string; company_name: string }[] = [];

  if (access.permissions[permissionKeys.clientsView] !== undefined) {
    const { data, error } = await database.from('clients').select('id, company_name').order('company_name');
    if (error) throw error;
    options = data;
  }

  if (keepClientId && !options.some((client) => client.id === keepClientId)) {
    options = [...(await getClientLabels([keepClientId])), ...options];
  }
  return options;
}

// A record's client by name, for people who cannot open the client itself.
export async function clientLabelFor(clientId: string | null) {
  if (!clientId) return null;
  const [label] = await getClientLabels([clientId]);
  return label ?? null;
}

// Client names only, for people who work for a client without opening its record.
export async function getClientLabels(clientIds: string[]) {
  if (clientIds.length === 0) return [];
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_client_labels', { p_clients: clientIds });
  if (error) throw error;
  return data;
}

export async function getClientStats() {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('clients').select('status');

  if (error) throw error;

  return {
    total: data.length,
    active: data.filter((client) => client.status === 'active').length,
    leads: data.filter((client) => client.status === 'lead').length,
  };
}

export async function listDueFollowUps(limit: number) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('clients')
    .select('id, company_name, next_follow_up_date')
    .not('next_follow_up_date', 'is', null)
    .lte('next_follow_up_date', todayInIndia())
    .order('next_follow_up_date')
    .limit(limit);

  if (error) throw error;
  return data;
}
