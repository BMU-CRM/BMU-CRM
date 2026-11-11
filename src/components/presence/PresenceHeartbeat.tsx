'use client';

import { useEffect } from 'react';
import { recordPresenceAction } from '@/server/actions/presenceActions';

const everyMs = 60_000;
// Without a click, key press or scroll for this long, the person shows as away.
const idleAfterMs = 5 * 60_000;

// Tells the server, about once a minute, that this person has the CRM open and
// whether they are using it. When every tab is closed the check-ins stop and they
// show as offline after a few minutes.
export function PresenceHeartbeat() {
  useEffect(() => {
    let lastInput = Date.now();
    const markActive = () => {
      lastInput = Date.now();
    };
    const isActive = () => document.visibilityState === 'visible' && Date.now() - lastInput < idleAfterMs;
    const beat = () => {
      void recordPresenceAction(isActive()).catch(() => undefined);
    };

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markActive();
        beat();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    beat();
    const timer = setInterval(beat, everyMs);
    return () => {
      clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, markActive));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
