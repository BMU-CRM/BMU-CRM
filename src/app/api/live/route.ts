import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/currentSession';
import { getAppDatabase, runAs, type Identity } from '@/server/database/localDatabase';
import { onChange, onTyping, type LiveChange } from '@/server/live/liveEvents';

export const dynamic = 'force-dynamic';

type Subscription = { table: string; column?: string; value?: string };

function readSubscriptions(request: NextRequest) {
  try {
    const parsed = JSON.parse(request.nextUrl.searchParams.get('topics') ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Subscription =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.table === 'string' &&
          /^\w+$/.test(item.table) &&
          (item.column === undefined || (typeof item.column === 'string' && /^\w+$/.test(item.column))) &&
          (item.value === undefined || typeof item.value === 'string'),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

// Only rows this user may read are announced, using the same rules as every query.
async function canSee(identity: Identity, change: LiveChange) {
  if (change.event === 'DELETE') return true;
  const db = await getAppDatabase();
  return runAs(db, identity, async (tx) => {
    if (change.row.id) {
      const { rows } = await tx.query<{ found: boolean }>(
        `select exists (select 1 from public."${change.table}" where id = $1) as found`,
        [change.row.id],
      );
      return rows[0]?.found === true;
    }
    if (change.row.conversation_id) {
      const { rows } = await tx.query<{ found: boolean }>('select public.can_view_conversation($1) as found', [
        change.row.conversation_id,
      ]);
      return rows[0]?.found === true;
    }
    return false;
  });
}

// A stream of server-sent events telling this page when something it shows has
// changed. The page then reloads its data, so nothing here carries the data itself.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.blocked) return new Response('Not signed in', { status: 401 });

  const identity: Identity = { role: 'authenticated', userId: user.userId };
  const subscriptions = readSubscriptions(request);
  const db = await getAppDatabase();

  const typingIds = new Set<string>();
  for (const id of (request.nextUrl.searchParams.get('typing') ?? '').split(',').filter(Boolean).slice(0, 5)) {
    const allowed = await runAs(db, identity, async (tx) => {
      const { rows } = await tx.query<{ allowed: boolean }>('select public.can_view_conversation($1) as allowed', [id]);
      return rows[0]?.allowed === true;
    }).catch(() => false);
    if (allowed) typingIds.add(id);
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const stopChanges = onChange((change) => {
        const wanted = subscriptions.some(
          (subscription) =>
            subscription.table === change.table &&
            (!subscription.column || change.row[subscription.column] === subscription.value),
        );
        if (!wanted) return;
        void canSee(identity, change)
          .then((visible) => {
            if (visible) send('change', { table: change.table, event: change.event });
          })
          .catch(() => {});
      });

      const stopTyping = onTyping((signal) => {
        if (typingIds.has(signal.conversationId) && signal.userId !== user.userId) {
          send('typing', { conversationId: signal.conversationId, name: signal.name });
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 25_000);

      cleanup = () => {
        stopChanges();
        stopTyping();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      request.signal.addEventListener('abort', () => cleanup());
      send('ready', {});
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
