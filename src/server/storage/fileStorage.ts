import 'server-only';
import { getSessionUser } from '@/server/auth/currentSession';
import { getAppDatabase } from '@/server/database/localDatabase';
import { signToken } from '@/server/security/signingSecret';
import { canReadObject } from './objectStore';

// Every file link is made here, so moving files to another store later means
// changing only this file and objectStore.ts. Links carry a signed, short-lived token.

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

// The upload itself is checked against the database's upload rules, as this user.
export async function createUploadLink(path: string) {
  const userId = await requireUserId();
  const token = await signToken(await getAppDatabase(), { k: 'upload', b: bucket, n: path, u: userId }, uploadLinkSeconds);
  return `/api/storage/upload/${token}`;
}

export async function createDownloadLink(path: string, options: { downloadAs?: string }) {
  const userId = await requireUserId();
  const db = await getAppDatabase();
  if (!(await canReadObject(db, { role: 'authenticated', userId }, bucket, path))) {
    throw new Error('You do not have access to this file.');
  }
  const token = await signToken(db, { k: 'read', b: bucket, n: path, d: options.downloadAs ?? null }, downloadLinkSeconds);
  return `/api/storage/object/${token}`;
}
