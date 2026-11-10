import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthUser, deleteAuthUser, EmailTakenError, latestEmailedLink } from '@/server/auth/authAccounts';
import { lastDispatchResult } from '@/server/database/backgroundServices';
import { databaseProvider, getAppDatabase } from '@/server/database/appDatabase';
import { handleDatabaseRequest } from '@/server/database/queryEngine';
import { removeObjects } from '@/server/storage/objectStore';
import { removeStoredObjects } from '@/server/storage/supabaseStorage';

// For automated browser tests only. Off unless TEST_SUPPORT_SECRET (at least 32
// characters) is set when the server starts, and every call must carry that secret.
// It lets a test create people and check data while the app holds the database open.
// Never set TEST_SUPPORT_SECRET on a server real people use.

function isAllowed(request: NextRequest) {
  const secret = process.env.TEST_SUPPORT_SECRET ?? '';
  if (secret.length < 32) return false;
  const given = request.headers.get('apikey') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = Buffer.from(secret);
  const received = Buffer.from(given);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isAllowed(request)) return new NextResponse('Not found', { status: 404 });

  const path = (await params).path.join('/');
  const db = await getAppDatabase();

  if (path.startsWith('rest/v1/')) {
    return handleDatabaseRequest(db, { role: 'service_role' }, request);
  }

  // Queries as one signed-in user, so row level security applies as it would in the app.
  const asUser = path.match(/^as\/([0-9a-f-]{36})\/rest\/v1\//);
  if (asUser?.[1]) {
    return handleDatabaseRequest(db, { role: 'authenticated', userId: asUser[1] }, request);
  }

  if (path === 'dispatch/last' && request.method === 'GET') {
    return NextResponse.json(lastDispatchResult() ?? null);
  }

  if (path === 'auth/v1/admin/users' && request.method === 'POST') {
    const body = (await request.json()) as { email: string; password?: string };
    try {
      const id = await createAuthUser(db, { email: body.email, password: body.password });
      return NextResponse.json({ id, email: body.email.toLowerCase() });
    } catch (error) {
      if (error instanceof EmailTakenError) {
        return NextResponse.json({ code: 'email_exists', msg: error.message }, { status: 422 });
      }
      throw error;
    }
  }

  const userMatch = path.match(/^auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
  if (userMatch?.[1] && request.method === 'DELETE') {
    await deleteAuthUser(db, userMatch[1]);
    return NextResponse.json({});
  }

  const bucketMatch = path.match(/^storage\/v1\/object\/([\w-]+)$/);
  if (bucketMatch?.[1] && request.method === 'DELETE') {
    const body = (await request.json()) as { prefixes?: string[] };
    if (databaseProvider() === 'supabase') await removeStoredObjects(bucketMatch[1], body.prefixes ?? []);
    else await removeObjects(db, bucketMatch[1], body.prefixes ?? []);
    return NextResponse.json([]);
  }

  if (path === 'mail' && request.method === 'GET') {
    const to = request.nextUrl.searchParams.get('to') ?? '';
    const kind = request.nextUrl.searchParams.get('kind') === 'recovery' ? 'recovery' : 'invite';
    return NextResponse.json(await latestEmailedLink(db, to, kind));
  }

  return new NextResponse('Not found', { status: 404 });
}

export { handle as DELETE, handle as GET, handle as HEAD, handle as PATCH, handle as POST };
