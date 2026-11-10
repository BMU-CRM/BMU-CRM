// Stores uploaded file contents in a folder on disk. Each stored file also has a row
// in storage.objects, written and read as the signed-in user, so the database's file
// rules decide who may upload and who may read every file.
import type { SqlDatabase } from '@/server/database/sqlDatabase';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { runAs, type Identity } from '@/server/database/sqlDatabase';

export class StorageError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Decided when the app runs, so the bundler is told not to look inside it.
export function storageRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.FILE_STORAGE_DIR || '.data/files');
}

// Object names come from the database, but are still checked so no name can reach
// outside the storage folder.
function objectPath(root: string, bucket: string, name: string) {
  if (!/^[\w-]+$/.test(bucket) || name.includes('\0') || name.split('/').some((part) => part === '..' || part === '')) {
    throw new StorageError(400, 'Invalid file name.');
  }
  const full = path.resolve(/* turbopackIgnore: true */ root, bucket, ...name.split('/'));
  if (!full.startsWith(path.resolve(/* turbopackIgnore: true */ root, bucket) + path.sep)) {
    throw new StorageError(400, 'Invalid file name.');
  }
  return full;
}

type Bucket = { file_size_limit: number | null; allowed_mime_types: string[] | null };

async function getBucket(db: SqlDatabase, bucket: string) {
  const { rows } = await db.query<Bucket>('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [
    bucket,
  ]);
  const [found] = rows;
  if (!found) throw new StorageError(404, 'Storage bucket not found.');
  return found;
}

// Saves an upload. The database row is written first, as the uploader, so a refused
// upload never touches the disk. If saving the bytes fails, the row is removed again.
export async function putObject(
  db: SqlDatabase,
  identity: Identity,
  object: { bucket: string; name: string; contentType: string; body: ReadableStream<Uint8Array> | Buffer },
  root = storageRoot(),
) {
  const bucket = await getBucket(db, object.bucket);
  const mimeType = (object.contentType.split(';')[0] ?? '').trim().toLowerCase() || 'application/octet-stream';
  if (bucket.allowed_mime_types && !bucket.allowed_mime_types.includes(mimeType)) {
    throw new StorageError(415, 'This type of file is not allowed.');
  }

  const target = objectPath(root, object.bucket, object.name);
  const partial = `${target}.uploading`;
  await mkdir(path.dirname(target), { recursive: true });

  try {
    await runAs(db, identity, async (tx) => {
      await tx.query(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, jsonb_build_object('mimetype', $3::text))`, [
        object.bucket,
        object.name,
        mimeType,
      ]);
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new StorageError(409, 'This file already exists.');
    if (code === '42501') throw new StorageError(403, 'You cannot upload this file.');
    throw error;
  }

  try {
    const limit = bucket.file_size_limit ?? Number.POSITIVE_INFINITY;
    let size = 0;
    const source = Buffer.isBuffer(object.body)
      ? Readable.from([object.body])
      : Readable.fromWeb(object.body as import('node:stream/web').ReadableStream<Uint8Array>);
    source.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) source.destroy(new StorageError(413, 'This file is larger than the upload limit.'));
    });
    await pipeline(source, createWriteStream(partial));
    await rm(target, { force: true });
    await import('node:fs/promises').then((fs) => fs.rename(partial, target));

    await db.query(
      `update storage.objects set metadata = metadata || jsonb_build_object('size', $3::bigint)
       where bucket_id = $1 and name = $2`,
      [object.bucket, object.name, size],
    );
    return { size, mimeType };
  } catch (error) {
    await rm(partial, { force: true });
    await db.query('delete from storage.objects where bucket_id = $1 and name = $2', [object.bucket, object.name]);
    throw error;
  }
}

// Whether this person may upload the object, by the same rule the database applies to
// new rows in storage.objects. Used before handing out an upload link that Supabase
// Storage accepts without checking the app's rules itself.
export async function canUploadObject(db: SqlDatabase, identity: Identity, bucket: string, name: string) {
  if (bucket !== 'files') return false;
  return runAs(db, identity, async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean }>('select public.can_upload_file_object($1) as allowed', [name]);
    return rows[0]?.allowed === true;
  });
}

// Whether this person may read the object, by the same rules as everything else.
export async function canReadObject(db: SqlDatabase, identity: Identity, bucket: string, name: string) {
  return runAs(db, identity, async (tx) => {
    const { rows } = await tx.query<{ found: boolean }>(
      'select exists (select 1 from storage.objects where bucket_id = $1 and name = $2) as found',
      [bucket, name],
    );
    return rows[0]?.found === true;
  });
}

export async function openObject(db: SqlDatabase, bucket: string, name: string, root = storageRoot()) {
  const { rows } = await db.query<{ metadata: { size?: number; mimetype?: string } }>(
    'select metadata from storage.objects where bucket_id = $1 and name = $2',
    [bucket, name],
  );
  const [record] = rows;
  if (!record) throw new StorageError(404, 'File not found.');

  const fullPath = objectPath(root, bucket, name);
  const info = await stat(fullPath).catch(() => null);
  if (!info) throw new StorageError(404, 'File not found.');

  return {
    size: info.size,
    contentType: record.metadata.mimetype ?? 'application/octet-stream',
    stream: () => Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>,
  };
}

export async function removeObjects(db: SqlDatabase, bucket: string, names: string[], root = storageRoot()) {
  for (const name of names) {
    await db.query('delete from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
    await rm(objectPath(root, bucket, name), { force: true });
  }
}
