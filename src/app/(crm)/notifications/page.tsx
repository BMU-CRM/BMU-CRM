import { BellOff, Settings } from 'lucide-react';
import type { Metadata } from 'next';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import taskTabs from '@/components/tasks/TaskViewTabs.module.css';
import { formatDateTime } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { markAllNotificationsReadAction } from '@/server/actions/notificationActions';
import { requireAccess } from '@/server/services/accessService';
import { listNotifications, notificationsPerPage } from '@/server/services/notificationService';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Notifications' };

type NotificationsPageProps = {
  searchParams: Promise<{ filter?: string; page?: string }>;
};

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  await requireAccess();
  const params = await searchParams;
  const unreadOnly = params.filter === 'unread';
  const page = parsePage(params.page);

  const { notifications, total } = await listNotifications({ unreadOnly, page });

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <ActionButton label="Mark all read" variant="secondary" action={markAllNotificationsReadAction} />
            <ButtonLink href="/profile/notifications" variant="ghost">
              <Settings size={16} aria-hidden="true" />
              Settings
            </ButtonLink>
          </>
        }
      />
      <nav className={taskTabs.tabs} aria-label="Notification filters">
        <Link href="/notifications" className={taskTabs.tab} aria-current={unreadOnly ? undefined : 'page'}>
          All
        </Link>
        <Link href="/notifications?filter=unread" className={taskTabs.tab} aria-current={unreadOnly ? 'page' : undefined}>
          Unread
        </Link>
      </nav>
      <Panel flush>
        {notifications.length === 0 ? (
          <EmptyState icon={BellOff} title="You are all caught up" description="New notifications appear here." />
        ) : (
          <>
            <ul className={layout.list}>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <a href={`/notifications/${notification.id}/open`} className={layout.row}>
                    <div className={layout.rowMain}>
                      <p className={notification.read_at ? undefined : layout.rowTitle}>
                        {notification.title}
                        {notification.event_count > 1 ? ` (+${notification.event_count - 1} more)` : ''}
                      </p>
                      {notification.body && <p className={layout.muted}>{notification.body}</p>}
                      <p className={layout.muted}>
                        {notification.actor_name ? `${notification.actor_name} · ` : ''}
                        {formatDateTime(notification.created_at)}
                      </p>
                    </div>
                    <span className={layout.badges}>
                      {notification.priority === 'high' && <StatusBadge tone="warning">Important</StatusBadge>}
                      {!notification.read_at && <StatusBadge tone="good">New</StatusBadge>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <PaginationBar
              page={page}
              perPage={notificationsPerPage}
              total={total}
              hrefForPage={(target) => `/notifications?${unreadOnly ? 'filter=unread&' : ''}page=${target}`}
            />
          </>
        )}
      </Panel>
    </>
  );
}
