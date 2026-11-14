import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/currentSession';
import { databaseProvider, getAppDatabase } from '@/server/database/appDatabase';
import { runAs } from '@/server/database/sqlDatabase';
import type { LiveConfig } from '@/lib/live/liveConfig';
import { getChangesTopic, getTypingTopic } from '@/server/live/realtimeChannels';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Tells an open page how to receive live updates. On this computer that is the app's
// own stream (/api/live). On Supabase it is Supabase Realtime, with the channel names
// only signed-in people are given.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.blocked) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const headers = { 'Cache-Control': 'private, no-store' };
  if (databaseProvider() !== 'supabase') return NextResponse.json({ mode: 'stream' } satisfies LiveConfig, { headers });

  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Live updates are not configured' }, { status: 503 });

  const db = await getAppDatabase();
  const name = await runAs(db, { role: 'authenticated', userId: user.userId }, async (tx) => {
    const { rows } = await tx.query<{ name: string | null }>(
      'select (select full_name from public.employees where id = public.current_employee_id()) as name',
    );
    return rows[0]?.name ?? null;
  });
  if (!name) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const requested = (request.nextUrl.searchParams.get('typing') ?? '')
    .split(',')
    .filter((id) => uuidPattern.test(id))
    .slice(0, 5);

  const typingTopics: Record<string, string> = {};
  for (const id of requested) {
    const allowed = await runAs(db, { role: 'authenticated', userId: user.userId }, async (tx) => {
      const { rows } = await tx.query<{ allowed: boolean }>('select public.can_view_conversation($1) as allowed', [id]);
      return rows[0]?.allowed === true;
    }).catch(() => false);
    if (allowed) typingTopics[id] = await getTypingTopic(db, id);
  }

  return NextResponse.json(
    {
      mode: 'realtime',
      url,
      key,
      changesTopic: await getChangesTopic(db),
      userId: user.userId,
      name,
      typingTopics,
    } satisfies LiveConfig,
    { headers },
  );
}
