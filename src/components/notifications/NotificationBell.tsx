'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';
import { formatDateTime } from '@/lib/formatDate';
import { useLiveRefresh } from '@/lib/live/liveUpdates';
import { markAllNotificationsReadAction } from '@/server/actions/notificationActions';
import styles from './NotificationBell.module.css';

export type BellNotification = {
  id: string;
  title: string;
  body: string | null;
  priority: 'normal' | 'high';
  event_count: number;
  read_at: string | null;
  created_at: string;
};

type NotificationBellProps = {
  employeeId: string;
  unreadCount: number;
  recent: BellNotification[];
  className?: string;
};

// The bell refreshes itself when a notification arrives. The server only announces
// notifications that belong to this person.
export function NotificationBell({ employeeId, unreadCount, recent, className }: NotificationBellProps) {
  const [isPending, startTransition] = useTransition();

  useLiveRefresh([{ table: 'notifications', column: 'recipient_id', value: employeeId }], {
    delayMs: 300,
    refreshOnConnect: false,
  });

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <>
      <button type="button" className={`${className ?? ''} ${styles.bell}`} popoverTarget="notification-menu" aria-label={label}>
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.count}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      <div id="notification-menu" popover="auto" className={styles.menu}>
        <div className={styles.header}>
          <p className={styles.heading}>Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              className={styles.textButton}
              disabled={isPending}
              onClick={() => startTransition(async () => void (await markAllNotificationsReadAction()))}
            >
              Mark all read
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className={styles.empty}>You are all caught up.</p>
        ) : (
          <ul className={styles.list}>
            {recent.map((notification) => (
              <li key={notification.id}>
                <a href={`/notifications/${notification.id}/open`} className={styles.item} data-unread={!notification.read_at}>
                  <span className={styles.title}>
                    {notification.title}
                    {notification.event_count > 1 && <span className={styles.more}> +{notification.event_count - 1}</span>}
                  </span>
                  {notification.body && <span className={styles.body}>{notification.body}</span>}
                  <span className={styles.time}>{formatDateTime(notification.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.footer}>
          <Link href="/notifications">See all</Link>
          <Link href="/profile/notifications">Settings</Link>
        </div>
      </div>
    </>
  );
}
