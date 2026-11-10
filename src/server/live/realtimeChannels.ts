import { createHmac } from 'node:crypto';
import type { SqlDatabase } from '@/server/database/sqlDatabase';
import { getSigningSecret, loadSecret } from '@/server/security/signingSecret';
import type { TypingSignal } from './liveEvents';

// Live updates on Supabase. Open pages listen on Supabase Realtime channels whose
// names are random, and only signed-in people are told them:
// - one channel for row changes, which carries only table names and row ids, never
//   the data itself. Pages then reload what they may see through the usual rules.
// - one channel per conversation for typing signals, named from the signing secret,
//   so only people the database lets read that conversation can work out its name.

const topics = new WeakMap<SqlDatabase, Promise<string>>();

// The database's live.broadcast_change() reads the same value.
export function getChangesTopic(db: SqlDatabase) {
  let topic = topics.get(db);
  if (!topic) {
    topic = loadSecret(db, 'live_topic').then((value) => `changes-${value.slice(0, 32)}`);
    topics.set(db, topic);
  }
  return topic;
}

export async function getTypingTopic(db: SqlDatabase, conversationId: string) {
  const digest = createHmac('sha256', await getSigningSecret(db)).update(`typing:${conversationId}`).digest('hex');
  return `typing-${digest.slice(0, 32)}`;
}

export async function broadcastTyping(db: SqlDatabase, signal: TypingSignal) {
  await db.query(`select realtime.send($1::jsonb, 'typing', $2, false)`, [
    JSON.stringify(signal),
    await getTypingTopic(db, signal.conversationId),
  ]);
}
