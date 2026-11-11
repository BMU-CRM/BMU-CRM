import { NextResponse, type NextRequest } from 'next/server';
import { parseId } from '@/lib/parseListParams';
import { createDatabaseClient } from '@/server/database/databaseClient';

// "Mark as read" on a desktop notification. Sent by the service worker with the
// person's own session, so row level security limits it to their own notifications.
// Only same-site requests are accepted.
export async function POST(request: NextRequest, { params }: { params: Promise<{ notificationId: string }> }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });

  const notificationId = parseId((await params).notificationId);
  if (!notificationId) return new NextResponse(null, { status: 404 });

  const database = await createDatabaseClient();
  const { data } = await database
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)
    .select('id');

  return new NextResponse(null, { status: data?.length ? 204 : 404 });
}
