import 'server-only';
import webPush from 'web-push';
import { safeNotificationLink } from '@/lib/notifications/notificationKinds';
import { createAdminDatabaseClient } from '@/server/database/databaseClient';

// Push services expire undeliverable messages after an hour.
const pushTimeToLiveSeconds = 3600;

function pushIsConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );
}

// Delivers one notification to every device its recipient has turned push on for.
// It runs with the service role, because it reads another person's subscriptions.
export async function dispatchNotification(notificationId: string) {
  if (!pushIsConfigured()) return { sent: 0, skipped: 'push is not configured' };

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );

  const admin = createAdminDatabaseClient();

  const { data: notification } = await admin
    .from('notifications')
    .select('id, recipient_id, kind, priority, title, body, link, event_count, read_at')
    .eq('id', notificationId)
    .maybeSingle();

  if (!notification || notification.read_at) return { sent: 0, skipped: 'not found or already read' };

  const { data: preference } = await admin
    .from('notification_preferences')
    .select('push_enabled')
    .eq('employee_id', notification.recipient_id)
    .eq('kind', notification.kind)
    .maybeSingle();

  if (preference && !preference.push_enabled) return { sent: 0, skipped: 'turned off by the recipient' };

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('employee_id', notification.recipient_id);

  if (!subscriptions?.length) return { sent: 0, skipped: 'no devices' };

  const payload = JSON.stringify({
    title: notification.title,
    body:
      notification.event_count > 1
        ? `${notification.body ?? ''} (+${notification.event_count - 1} more)`.trim()
        : (notification.body ?? ''),
    url: `/notifications/${notification.id}/open`,
    fallbackUrl: safeNotificationLink(notification.link),
    tag: notification.id,
    priority: notification.priority,
  });

  let sent = 0;
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: pushTimeToLiveSeconds, urgency: notification.priority === 'high' ? 'high' : 'normal' },
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // The device unsubscribed or the browser was reset, so stop sending to it.
        if (statusCode === 404 || statusCode === 410) expired.push(subscription.id);
        else console.error('Push delivery failed', statusCode, (error as Error).message);
      }
    }),
  );

  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired);
  await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', notification.id);

  return { sent, expired: expired.length };
}
