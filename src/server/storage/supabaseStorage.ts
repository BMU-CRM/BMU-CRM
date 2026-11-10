import 'server-only';

// File contents kept in Supabase Storage, used when the app runs on Supabase. The
// browser sends and fetches files straight to and from Storage with short-lived signed
// links, so large files never pass through Vercel, which limits request sizes.
// These calls use the secret key, so every link is made only after the app has
// checked, as the signed-in user, that the database's file rules allow it.

function settings() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set to store files in Supabase.');
  return { url, key };
}

// Object names come from the database. Each part is encoded so it stays one path part.
function objectPath(bucket: string, name: string) {
  if (!/^[\w-]+$/.test(bucket) || name.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Invalid file name.');
  }
  return `${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;
}

async function storageRequest<T>(path: string, init: { method: string; body?: unknown; headers?: Record<string, string> }) {
  const { url, key } = settings();
  const response = await fetch(`${url}/storage/v1${path}`, {
    method: init.method,
    headers: {
      apikey: key,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Supabase Storage refused ${init.method} ${path.split('?')[0]}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

// A link the browser can send one file to with PUT, for the next two hours. It cannot
// replace a file that already exists.
export async function createSignedUploadUrl(bucket: string, name: string) {
  const { url } = settings();
  const result = await storageRequest<{ url: string }>(`/object/upload/sign/${objectPath(bucket, name)}`, {
    method: 'POST',
    headers: { 'x-upsert': 'false' },
  });
  return `${url}/storage/v1${result.url}`;
}

// A link that opens the file for the given number of seconds. With downloadAs, the
// browser saves it under that name instead of showing it.
export async function createSignedDownloadUrl(bucket: string, name: string, lifetimeSeconds: number, downloadAs?: string) {
  const { url } = settings();
  const result = await storageRequest<{ signedURL: string }>(`/object/sign/${objectPath(bucket, name)}`, {
    method: 'POST',
    body: { expiresIn: lifetimeSeconds },
  });
  const link = new URL(`${url}/storage/v1${result.signedURL}`);
  if (downloadAs !== undefined) link.searchParams.set('download', downloadAs);
  return link.toString();
}

export async function removeStoredObjects(bucket: string, names: string[]) {
  if (names.length === 0) return;
  if (!/^[\w-]+$/.test(bucket)) throw new Error('Invalid bucket name.');
  await storageRequest<unknown>(`/object/${bucket}`, { method: 'DELETE', body: { prefixes: names } });
}
