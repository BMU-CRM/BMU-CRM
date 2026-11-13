'use client';

import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, useTransition, type PointerEvent } from 'react';
import { formatDateTime } from '@/lib/formatDate';
import { useLiveRefresh } from '@/lib/live/liveUpdates';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/server/actions/notificationActions';
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

// The bell lists unread notifications. Each can be cleared with its close button or,
// on a touch screen, by swiping it sideways. Cleared ones are marked read and stay
// on the notifications page. The bell refreshes itself when a notification arrives;
// the server only announces notifications that belong to this person.
export function NotificationBell({ employeeId, unreadCount, recent, className }: NotificationBellProps) {
  const [isMarkingAll, startMarkingAll] = useTransition();
  const [, startClearing] = useTransition();
  // Hidden straight away, before the server confirms.
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());

  useLiveRefresh([{ table: 'notifications', column: 'recipient_id', value: employeeId }], {
    delayMs: 300,
    refreshOnConnect: false,
  });

  const shown = isMarkingAll ? [] : recent.filter((notification) => !notification.read_at && !cleared.has(notification.id));
  const count = isMarkingAll ? 0 : Math.max(0, unreadCount - recent.filter((notification) => cleared.has(notification.id)).length);
  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';

  function clear(id: string) {
    setCleared((current) => new Set(current).add(id));
    startClearing(async () => {
      const result = await markNotificationReadAction(id);
      // If it could not be cleared, show it again. One already read elsewhere is not
      // in the refreshed list anyway.
      if (result.status === 'error') {
        setCleared((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    });
  }

  return (
    <>
      <button type="button" className={`${className ?? ''} ${styles.bell}`} popoverTarget="notification-menu" aria-label={label}>
        <Bell size={18} aria-hidden="true" />
        {count > 0 && <span className={styles.count}>{count > 99 ? '99+' : count}</span>}
      </button>

      <div id="notification-menu" popover="auto" className={styles.menu}>
        <div className={styles.header}>
          <p className={styles.heading}>Notifications</p>
          {count > 0 && (
            <button
              type="button"
              className={styles.textButton}
              disabled={isMarkingAll}
              onClick={() => startMarkingAll(async () => void (await markAllNotificationsReadAction()))}
            >
              Mark all read
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>You are all caught up.</p>
        ) : (
          <ul className={styles.list}>
            {shown.map((notification) => (
              <BellItem key={notification.id} notification={notification} onClear={() => clear(notification.id)} />
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

// How far a finger must move before it counts as a swipe rather than a tap.
const swipeStartPixels = 10;

function BellItem({ notification, onClear }: { notification: BellNotification; onClear: () => void }) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const gesture = useRef<{ x: number; y: number; offset: number; swiping: boolean } | null>(null);
  // A swipe that ends on the link must not also open it.
  const swiped = useRef(false);

  function leave(direction: number, width: number) {
    setIsLeaving(true);
    setOffset(direction * width);
    window.setTimeout(onClear, 180);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' || isLeaving) return;
    gesture.current = { x: event.clientX, y: event.clientY, offset: 0, swiping: false };
    swiped.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.swiping) {
      if (Math.abs(dx) > swipeStartPixels && Math.abs(dx) > Math.abs(dy)) {
        current.swiping = true;
        swiped.current = true;
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > swipeStartPixels) {
        // Scrolling the list, not swiping.
        gesture.current = null;
        return;
      } else {
        return;
      }
    }
    current.offset = dx;
    setOffset(dx);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    gesture.current = null;
    setIsDragging(false);
    if (!current?.swiping) return;
    const width = event.currentTarget.offsetWidth;
    if (Math.abs(current.offset) > Math.min(100, width * 0.35)) leave(Math.sign(current.offset), width);
    else setOffset(0);
  }

  function onPointerCancel() {
    gesture.current = null;
    setIsDragging(false);
    setOffset(0);
  }

  return (
    <li className={styles.entry} data-leaving={isLeaving}>
      <div
        className={styles.slide}
        data-dragging={isDragging}
        style={offset ? { transform: `translateX(${offset}px)`, opacity: 1 - Math.min(Math.abs(offset) / 300, 0.6) } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(event) => {
          if (swiped.current) {
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        <a href={`/notifications/${notification.id}/open`} className={styles.item} data-unread={!notification.read_at}>
          <span className={styles.title}>
            {notification.title}
            {notification.event_count > 1 && <span className={styles.more}> +{notification.event_count - 1}</span>}
          </span>
          {notification.body && <span className={styles.body}>{notification.body}</span>}
          <span className={styles.time}>{formatDateTime(notification.created_at)}</span>
        </a>
        <button
          type="button"
          className={styles.clear}
          aria-label={`Clear notification: ${notification.title}`}
          title="Clear"
          disabled={isLeaving}
          onClick={(event) => leave(1, event.currentTarget.parentElement?.offsetWidth ?? 0)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
