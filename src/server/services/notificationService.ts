import 'server-only';
import { notificationKinds } from '@/lib/notifications/notificationKinds';
import { createDatabaseClient } from '@/server/database/databaseClient';

export const notificationsPerPage = 30;

const notificationFields = 'id, kind, priority, title, body, link, actor_name, event_count, read_at, created_at';

export async function getNotificationSummary() {
  const database = await createDatabaseClient();

  const [recent, unread] = await Promise.all([
    database.from('notifications').select(notificationFields).order('created_at', { ascending: false }).limit(8),
    database.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);

  if (recent.error) throw recent.error;
  return { recent: recent.data, unreadCount: unread.count ?? 0 };
}

export type NotificationItem = Awaited<ReturnType<typeof getNotificationSummary>>['recent'][number];

export async function listNotifications({ unreadOnly, page }: { unreadOnly: boolean; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * notificationsPerPage;

  let query = database
    .from('notifications')
    .select(notificationFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + notificationsPerPage - 1);

  if (unreadOnly) query = query.is('read_at', null);

  const { data, count, error } = await query;
  if (error) throw error;
  return { notifications: data, total: count ?? 0 };
}

export async function getPushPreferences() {
  const database = await createDatabaseClient();

  const { data, error } = await database.from('notification_preferences').select('kind, push_enabled');
  if (error) throw error;

  const saved = new Map(data.map((row) => [row.kind, row.push_enabled]));
  return notificationKinds.map((kind) => ({ kind, pushEnabled: saved.get(kind) ?? true }));
}
