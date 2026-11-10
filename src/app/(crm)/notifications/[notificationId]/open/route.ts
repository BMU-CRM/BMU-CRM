import { NextResponse, type NextRequest } from 'next/server';
import { safeNotificationLink } from '@/lib/notifications/notificationKinds';
import { parseId } from '@/lib/parseListParams';
import { createDatabaseClient } from '@/server/database/databaseClient';

// Marks a notification read and opens what it is about. Row level security means
// people can only open their own notifications.
export async function GET(request: NextRequest, { params }: { params: Promise<{ notificationId: string }> }) {
  const notificationId = parseId((await params).notificationId);
  const destination = request.nextUrl.clone();
  destination.search = '';
  destination.pathname = '/notifications';

  if (notificationId) {
    const database = await createDatabaseClient();
    const { data } = await database
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('link')
      .maybeSingle();

    if (data) destination.pathname = safeNotificationLink(data.link);
  }

  return NextResponse.redirect(destination);
}
