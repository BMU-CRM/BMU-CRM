'use client';

import { useEffect } from 'react';

// Keeps the newest message in view, unless the link points at a particular message.
export function ScrollToLatest({ containerId, messageCount }: { containerId: string; messageCount: number }) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const target = window.location.hash ? document.querySelector(window.location.hash) : null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [containerId, messageCount]);

  return null;
}
