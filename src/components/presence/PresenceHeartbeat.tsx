'use client';

import { useEffect } from 'react';
import { startCheckingIn } from '@/lib/presence/presenceStore';

// Tells the server this person has the CRM open and whether they are using it: every
// 2 minutes in use, every 5 minutes untouched or in the background, together with the
// status dots on the page, and shared by all their tabs (see presenceStore). When every
// tab is closed the check-ins stop and they show as offline after a few minutes.
export function PresenceHeartbeat({ employeeId }: { employeeId: string }) {
  useEffect(() => startCheckingIn(employeeId), [employeeId]);
  return null;
}
