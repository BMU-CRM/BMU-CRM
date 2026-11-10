'use client';

import { useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page when a ticket changes. The server only announces changes to
// tickets this user may see, and the page is always rebuilt on the server.
export function TicketLiveRefresh({ ticketId }: { ticketId?: string }) {
  useLiveRefresh(ticketId ? [{ table: 'tickets', column: 'id', value: ticketId }] : [{ table: 'tickets' }]);
  return null;
}
