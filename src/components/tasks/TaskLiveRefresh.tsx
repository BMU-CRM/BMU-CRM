'use client';

import { useLiveRefresh } from '@/lib/live/liveUpdates';

// Reloads the page's data when a task changes. The server only announces changes
// to tasks this user may see, and the page itself is always rebuilt on the server.
export function TaskLiveRefresh({ taskId }: { taskId?: string }) {
  useLiveRefresh(
    taskId
      ? [
          { table: 'tasks', column: 'id', value: taskId },
          { table: 'task_comments', column: 'task_id', value: taskId },
        ]
      : [{ table: 'tasks' }, { table: 'task_comments' }],
  );
  return null;
}
