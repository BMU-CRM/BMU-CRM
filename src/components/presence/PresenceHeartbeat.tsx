'use client';

import { useEffect } from 'react';
import { startCheckingIn } from '@/lib/presence/presenceStore';

// Tells the server this person has the CRM open and whether they are using it: every
// minute in the foreground, every 4 minutes in the background, together with the
// status dots on the page (see presenceStore). When every tab is closed the check-ins
// stop and they show as offline after a few minutes.
export function PresenceHeartbeat() {
  useEffect(() => startCheckingIn(), []);
  return null;
}
