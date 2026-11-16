import 'server-only';
import type { LiveConfig } from '@/lib/live/liveConfig';
import { databaseProvider, getAppDatabase } from '@/server/database/appDatabase';
import { runAs } from '@/server/database/sqlDatabase';
import { getChangesTopic, getTypingTopic } from './realtimeChannels';

export type LiveConfigResult = { config: LiveConfig } | { error: string; status: number };

// How an open page receives live updates. On this computer that is the app's own stream
// (/api/live). On Supabase it is Supabase Realtime, with the channel names only
// signed-in people are given. `name` is the person's name, sent with their typing signal.
// The app's pages carry this with them; /api/live/config adds a chat's typing channels.
export async function getLiveConfig(
  userId: string,
  name: string,
  typingConversationIds: string[] = [],
): Promise<LiveConfigResult> {
  if (databaseProvider() !== 'supabase') return { config: { mode: 'stream' } };

  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { error: 'Live updates are not configured', status: 503 };

  const db = await getAppDatabase();
  const typingTopics: Record<string, string> = {};
  for (const id of typingConversationIds) {
    const allowed = await runAs(db, { role: 'authenticated', userId }, async (tx) => {
      const { rows } = await tx.query<{ allowed: boolean }>('select public.can_view_conversation($1) as allowed', [id]);
      return rows[0]?.allowed === true;
    }).catch(() => false);
    if (allowed) typingTopics[id] = await getTypingTopic(db, id);
  }

  return {
    config: { mode: 'realtime', url, key, changesTopic: await getChangesTopic(db), userId, name, typingTopics },
  };
}
