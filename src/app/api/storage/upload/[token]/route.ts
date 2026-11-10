import { NextResponse, type NextRequest } from 'next/server';
import { getAppDatabase } from '@/server/database/localDatabase';
import { readToken } from '@/server/security/signingSecret';
import { putObject, StorageError } from '@/server/storage/objectStore';

type UploadToken = { k: string; b: string; n: string; u: string };

// Receives a file the browser sends with a signed upload link. The link says which
// user and file it is for; the database decides whether that user may upload it.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = await getAppDatabase();
  const token = await readToken<UploadToken>(db, (await params).token);
  if (!token || token.k !== 'upload' || !request.body) {
    return NextResponse.json({ error: 'This upload link has expired. Please try again.' }, { status: 403 });
  }

  try {
    await putObject(db, { role: 'authenticated', userId: token.u }, {
      bucket: token.b,
      name: token.n,
      contentType: request.headers.get('content-type') ?? 'application/octet-stream',
      body: request.body,
    });
    return NextResponse.json({ Key: `${token.b}/${token.n}` });
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Upload failed', error);
    return NextResponse.json({ error: 'The upload failed. Please try again.' }, { status: 500 });
  }
}
