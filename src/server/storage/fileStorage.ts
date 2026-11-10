import 'server-only';
import { getSessionUser } from '@/server/auth/currentSession';
import { databaseProvider, getAppDatabase } from '@/server/database/appDatabase';
import { signToken } from '@/server/security/signingSecret';
import { canReadObject, canUploadObject } from './objectStore';
import { createSignedDownloadUrl, createSignedUploadUrl } from './supabaseStorage';

// Every file link is made here. On this computer, files are kept on disk and the links
// point at this app (objectStore.ts). On Supabase, they point at Supabase Storage
// (supabaseStorage.ts). Either way the links are signed and short-lived.

const bucket = 'files';

// Long enough for the browser to start the request, short enough that a copied link
// soon stops working.
const downloadLinkSeconds = 60;
const uploadLinkSeconds = 15 * 60;

async function requireUserId() {
  const user = await getSessionUser();
  if (!user || user.blocked) throw new Error('Not signed in.');
  return user.userId;
}

// The upload is checked against the database's upload rules, as this user.
export async function createUploadLink(path: string) {
  const userId = await requireUserId();
  const db = await getAppDatabase();

  if (databaseProvider() === 'supabase') {
    if (!(await canUploadObject(db, { role: 'authenticated', userId }, bucket, path))) {
      throw new Error('You cannot upload this file.');
    }
    return createSignedUploadUrl(bucket, path);
  }

  // The disk store checks the rules itself when the file arrives.
  const token = await signToken(db, { k: 'upload', b: bucket, n: path, u: userId }, uploadLinkSeconds);
  return `/api/storage/upload/${token}`;
}

export async function createDownloadLink(path: string, options: { downloadAs?: string }) {
  const userId = await requireUserId();
  const db = await getAppDatabase();
  if (!(await canReadObject(db, { role: 'authenticated', userId }, bucket, path))) {
    throw new Error('You do not have access to this file.');
  }

  if (databaseProvider() === 'supabase') {
    return createSignedDownloadUrl(bucket, path, downloadLinkSeconds, options.downloadAs);
  }

  const token = await signToken(db, { k: 'read', b: bucket, n: path, d: options.downloadAs ?? null }, downloadLinkSeconds);
  return `/api/storage/object/${token}`;
}
