'use client';

import { useEffect, useState } from 'react';

export function formatWorked(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

// Hours worked on a task. While it is in progress the figure keeps counting on screen,
// from what the server worked out when the page loaded.
export function TaskWorkTimer({ workedSeconds, running }: { workedSeconds: number; running: boolean }) {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (!running) return;
    const loadedAt = Date.now();
    const timer = window.setInterval(() => setExtra(Math.floor((Date.now() - loadedAt) / 1000)), 30_000);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <span>
      {formatWorked(workedSeconds + (running ? extra : 0))}
      {running ? ' (counting now)' : ''}
    </span>
  );
}
