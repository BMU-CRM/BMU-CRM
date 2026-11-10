'use client';

import { useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page when a quotation or invoice changes, for example when someone else
// records a payment. The server only announces changes this user may see.
export function FinanceLiveRefresh({ table, id }: { table: 'quotations' | 'invoices'; id?: string }) {
  useLiveRefresh(id ? [{ table, column: 'id', value: id }] : [{ table }]);
  return null;
}
