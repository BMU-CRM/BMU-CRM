'use client';

import { listRefreshGapMs, useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page when a ticket changes. The server only announces changes to
// tickets this user may see, and the page is always rebuilt on the server. The list
// reloads at most once every 10 seconds, however many tickets change.
export function TicketLiveRefresh({ ticketId }: { ticketId?: string }) {
  useLiveRefresh(
    ticketId ? [{ table: 'tickets', column: 'id', value: ticketId }] : [{ table: 'tickets' }],
    ticketId ? {} : { minGapMs: listRefreshGapMs },
  );
  return null;
}
