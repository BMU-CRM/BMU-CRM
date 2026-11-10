import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminDatabaseClient } from '@/server/database/databaseClient';

// The integration point for attendance systems such as Pagerbook. A system sends rows of
// { employee, date, check_in, check_out } with the shared key. Employee can be a work
// email or an employee ID. Times can be "09:30" in Indian time, or full timestamps.
// A small adapter can translate any system's format into these rows.

const rowSchema = z.object({
  employee: z.string().trim().min(1).max(200),
  date: z.iso.date(),
  check_in: z.string().trim().max(40).optional(),
  check_out: z.string().trim().max(40).optional(),
});

const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(5000) });

function hasValidKey(request: NextRequest) {
  const expected = process.env.ATTENDANCE_IMPORT_SECRET;
  const received = request.headers.get('x-integration-key');
  if (!expected || !received) return false;

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(request: NextRequest) {
  if (!hasValidKey(request)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Send { rows: [{ employee, date, check_in, check_out }] }' }, { status: 400 });
  }

  const admin = createAdminDatabaseClient();
  const { data, error } = await admin.rpc('import_attendance', { p_rows: body.data.rows });
  if (error) {
    console.error('Attendance import failed', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }

  return NextResponse.json(data);
}
