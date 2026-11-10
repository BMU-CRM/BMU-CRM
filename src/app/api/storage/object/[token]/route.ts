import { NextResponse, type NextRequest } from 'next/server';
import { databaseProvider, getAppDatabase } from '@/server/database/appDatabase';
import { readToken } from '@/server/security/signingSecret';
import { openObject, StorageError } from '@/server/storage/objectStore';

type ReadToken = { k: string; b: string; n: string; d: string | null };

// Sends a stored file. The signed link is only made after the database confirmed
// the user may read the file, and it stops working after a minute.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // On Supabase, files are fetched straight from Supabase Storage instead.
  if (databaseProvider() === 'supabase') return new NextResponse('Not found', { status: 404 });

  const db = await getAppDatabase();
  const token = await readToken<ReadToken>(db, (await params).token);
  if (!token || token.k !== 'read') {
    return new NextResponse('This link has expired. Please open the file again.', { status: 403 });
  }

  try {
    const object = await openObject(db, token.b, token.n);
    const disposition = token.d
      ? `attachment; filename*=UTF-8''${encodeURIComponent(token.d)}`
      : 'inline';

    return new NextResponse(object.stream(), {
      headers: {
        'Content-Type': object.contentType,
        'Content-Length': String(object.size),
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof StorageError) return new NextResponse(error.message, { status: error.status });
    console.error('Could not send file', error);
    return new NextResponse('The file could not be opened. Please try again.', { status: 500 });
  }
}
