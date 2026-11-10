import { NextResponse, type NextRequest } from 'next/server';
import { previewKindOf } from '@/lib/files/fileTypes';
import { parseId } from '@/lib/parseListParams';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { createDownloadLink } from '@/server/storage/fileStorage';

// Checks access, records it, then sends the browser to a link that expires in a minute.
// Only types that are safe to display open in the browser. Everything else downloads.
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const fileId = parseId((await params).fileId);
  const notFound = new NextResponse('File not found', { status: 404 });
  if (!fileId) return notFound;

  const database = await createDatabaseClient();
  const { data: file } = await database
    .from('files')
    .select('id, name, kind, current_version, external_url')
    .eq('id', fileId)
    .eq('status', 'ready')
    .maybeSingle();

  if (!file || file.kind !== 'upload') return notFound;

  const requested = Number(request.nextUrl.searchParams.get('version'));
  const versionNumber = Number.isInteger(requested) && requested > 0 ? requested : file.current_version;

  const { data: version } = await database
    .from('file_versions')
    .select('storage_path, original_name')
    .eq('file_id', fileId)
    .eq('version', versionNumber)
    .not('uploaded_at', 'is', null)
    .maybeSingle();

  if (!version) return notFound;

  const wantsView = request.nextUrl.searchParams.get('mode') === 'view';
  const canPreview = previewKindOf(version.original_name) !== null;
  const action = wantsView && canPreview ? 'view' : 'download';

  await database.rpc('record_file_access', { p_file: fileId, p_action: action, p_version: versionNumber });

  try {
    const link = await createDownloadLink(version.storage_path, {
      downloadAs: action === 'download' ? file.name : undefined,
    });
    return NextResponse.redirect(new URL(link, request.url), { status: 302, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Could not create download link', error);
    return new NextResponse('The file could not be opened. Please try again.', { status: 502 });
  }
}
