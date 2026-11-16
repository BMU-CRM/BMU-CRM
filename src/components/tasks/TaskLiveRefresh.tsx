'use client';

import { listRefreshGapMs, useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page's data when a task changes. The server only announces changes
// to tasks this user may see, and the page itself is always rebuilt on the server.
// A list reloads at most once every 10 seconds, however many tasks change, and not for
// comments, which it does not show.
export function TaskLiveRefresh({ taskId }: { taskId?: string }) {
  useLiveRefresh(
    taskId
      ? [
          { table: 'tasks', column: 'id', value: taskId },
          { table: 'task_comments', column: 'task_id', value: taskId },
        ]
      : [{ table: 'tasks' }],
    taskId ? {} : { minGapMs: listRefreshGapMs },
  );
  return null;
}
