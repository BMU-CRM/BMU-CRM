// Work the running app does alongside answering requests: running scheduled jobs,
// sending requests the database queued (such as push notifications), and telling open
// pages about changes. Started once, when the app first opens its database.
import type { PGlite } from '@electric-sql/pglite';
import { scheduleMatches } from '@/server/jobs/cronSchedule';
import { publishChange, type LiveChange } from '@/server/live/liveEvents';

// Push requests with this address are handled inside the app instead of over the web.
const internalDispatchUrl = 'internal://notifications/dispatch';

// What the most recent push delivery reported, for checking that push works.
const resultKey = Symbol.for('crm.lastDispatchResult');
type GlobalWithResult = typeof globalThis & { [resultKey]?: unknown };

export function lastDispatchResult() {
  return (globalThis as GlobalWithResult)[resultKey];
}

async function configureNotificationDispatch(db: PGlite) {
  const externalUrl = process.env.NOTIFICATION_DISPATCH_URL;
  const externalSecret = process.env.NOTIFICATION_DISPATCH_SECRET;
  const [url, secret] =
    externalUrl && externalSecret ? [externalUrl, externalSecret] : [internalDispatchUrl, 'internal'];
  await db.query('select public.configure_notification_dispatch($1, $2)', [url, secret]);
}

async function runDueJobs(db: PGlite) {
  const now = new Date();
  now.setUTCSeconds(0, 0);

  const { rows } = await db.query<{ jobid: number; jobname: string; schedule: string; command: string; last_run_at: string | null }>(
    'select jobid, jobname, schedule, command, last_run_at from cron.job where active',
  );
  for (const job of rows) {
    if (!scheduleMatches(job.schedule, now)) continue;
    if (job.last_run_at && new Date(job.last_run_at) >= now) continue;

    await db.query('update cron.job set last_run_at = $2 where jobid = $1', [job.jobid, now.toISOString()]);
    try {
      await db.exec(job.command);
    } catch (error) {
      console.error(`Scheduled job ${job.jobname} failed`, error);
    }
  }
}

let sending = false;

async function sendQueuedRequests(db: PGlite) {
  if (sending) return;
  sending = true;
  try {
    for (;;) {
      const { rows } = await db.query<{
        id: number;
        url: string;
        headers: Record<string, string>;
        body: unknown;
        timeout_milliseconds: number;
      }>('delete from net.http_request_queue where id = (select min(id) from net.http_request_queue) returning *');
      const request = rows[0];
      if (!request) break;

      try {
        if (request.url === internalDispatchUrl) {
          const { dispatchNotification } = await import('@/server/notificationDispatcher');
          (globalThis as GlobalWithResult)[resultKey] = await dispatchNotification(
            String((request.body as { id?: string })?.id ?? ''),
          );
        } else {
          await fetch(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(request.body ?? {}),
            signal: AbortSignal.timeout(request.timeout_milliseconds),
          });
        }
      } catch (error) {
        console.error('A queued request failed', request.url, error);
      }
    }
  } finally {
    sending = false;
  }
}

export async function startBackgroundServices(db: PGlite) {
  await configureNotificationDispatch(db);

  await db.listen('live_changes', (payload) => {
    try {
      publishChange(JSON.parse(payload) as LiveChange);
    } catch (error) {
      console.error('Could not read a live change', error);
    }
  });
  await db.listen('net_requests', () => {
    void sendQueuedRequests(db);
  });

  // Checks once a minute, a few seconds after the minute starts.
  const tick = () => {
    void runDueJobs(db).catch((error) => console.error('Scheduled jobs failed', error));
    void sendQueuedRequests(db);
  };
  const untilNextMinute = 60_000 - (Date.now() % 60_000) + 2_000;
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000).unref();
  }, untilNextMinute).unref();

  void sendQueuedRequests(db);
}
