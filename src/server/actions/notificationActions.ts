'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { databaseFailure, failure, success, type ActionResult } from '@/lib/actionResult';
import { notificationKinds } from '@/lib/notifications/notificationKinds';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.rpc('mark_all_notifications_read');
  if (error) return databaseFailure(error);

  revalidatePath('/', 'layout');
  return success('All caught up.');
}

export async function savePushPreferencesAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure('You do not have permission to do this.');

  const enabled = new Set(formData.getAll('push').map(String));
  const rows = notificationKinds.map((kind) => ({
    employee_id: access.employee.id,
    kind,
    push_enabled: enabled.has(kind),
  }));

  const database = await createDatabaseClient();
  const { error } = await database.from('notification_preferences').upsert(rows);
  if (error) return databaseFailure(error);

  revalidatePath('/profile/notifications');
  return success('Your notification settings are saved.');
}

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscriptionAction(subscription: unknown, userAgent: string): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return failure('This browser returned an invalid push subscription.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('save_push_subscription', {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) return databaseFailure(error);

  return success('Push notifications are on for this device.');
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { error } = await database.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return databaseFailure(error);

  return success('Push notifications are off for this device.');
}
