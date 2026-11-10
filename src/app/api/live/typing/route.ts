import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/server/auth/currentSession';
import { getAppDatabase, runAs } from '@/server/database/localDatabase';
import { publishTyping } from '@/server/live/liveEvents';

// Tells the other people in a conversation that this user is typing. The name comes
// from the database, not the browser, and only members of the conversation can send.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.blocked) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = z.object({ conversationId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const db = await getAppDatabase();
  const result = await runAs(db, { role: 'authenticated', userId: user.userId }, async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean; name: string | null }>(
      `select public.can_view_conversation($1) as allowed,
              (select full_name from public.employees where id = public.current_employee_id()) as name`,
      [body.data.conversationId],
    );
    return rows[0];
  });

  if (!result?.allowed || !result.name) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  publishTyping({ conversationId: body.data.conversationId, name: result.name, userId: user.userId });
  return new NextResponse(null, { status: 204 });
}
