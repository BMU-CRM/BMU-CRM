import 'server-only';
import { createDatabaseClient } from '@/server/database/databaseClient';

export const auditLogsPerPage = 50;

export async function listAuditLogs({ entityType, page }: { entityType?: string; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * auditLogsPerPage;

  let query = database
    .from('audit_logs')
    .select('id, actor_name, action, entity_type, entity_id, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + auditLogsPerPage - 1);

  if (entityType) query = query.eq('entity_type', entityType);

  const { data, count, error } = await query;
  if (error) throw error;

  return { logs: data, total: count ?? 0 };
}

export async function listRecentActivity(limit: number) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('audit_logs')
    .select('id, actor_name, action, entity_type, details, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
