import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/currentSession';
import { getAppDatabase } from '@/server/database/appDatabase';
import { runAs } from '@/server/database/sqlDatabase';
import { getLiveConfig } from '@/server/live/liveConfigService';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Tells an open page how to receive live updates, with the typing channels of the
// conversations it asks for. Pages already carry the rest (see getLiveConfig), so only
// an open chat asks here.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.blocked) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

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

  const result = await getLiveConfig(user.userId, name, requested);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.config, { headers: { 'Cache-Control': 'private, no-store' } });
}
