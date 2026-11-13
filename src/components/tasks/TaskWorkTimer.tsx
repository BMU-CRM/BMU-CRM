'use client';

import { useEffect, useState } from 'react';

export function formatWorked(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

type TaskWorkTimerProps = {
  // Hours already counted before the stretch now running, in seconds.
  countedSeconds: number;
  // When the running stretch began; null while the task is not being worked on.
  startedAt: string | null;
};

// Hours worked on a task. Time on hold is not counted: on Resume work the figure carries
// on from where it stopped. While work is under way it keeps counting on screen.
export function TaskWorkTimer({ countedSeconds, startedAt }: TaskWorkTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [startedAt]);

  const running = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;

  return (
    // The server and the browser read the clock moments apart.
    <span suppressHydrationWarning>
      {formatWorked(countedSeconds + running)}
      {startedAt ? ' (counting now)' : ''}
    </span>
  );
}
