'use client';

import { listRefreshGapMs, useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page when a quotation or invoice changes, for example when someone else
// records a payment. The server only announces changes this user may see. A list
// reloads at most once every 10 seconds, however many change.
export function FinanceLiveRefresh({ table, id }: { table: 'quotations' | 'invoices'; id?: string }) {
  useLiveRefresh(id ? [{ table, column: 'id', value: id }] : [{ table }], id ? {} : { minGapMs: listRefreshGapMs });
  return null;
}
