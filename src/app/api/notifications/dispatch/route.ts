import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchNotification } from '@/server/notificationDispatcher';

// Push delivery normally runs inside the app. This address is used instead when
// NOTIFICATION_DISPATCH_URL and NOTIFICATION_DISPATCH_SECRET are set, for example if
// the database is moved to a hosted service that sends web requests itself. The
// shared secret proves the call came from the database, not from someone on the web.
function hasValidSecret(request: NextRequest) {
  const expected = process.env.NOTIFICATION_DISPATCH_SECRET;
  const received = request.headers.get('x-dispatch-secret');
  if (!expected || !received) return false;

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }

  const body = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const result = await dispatchNotification(body.data.id);
  return NextResponse.json(result);
}
