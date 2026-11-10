import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getAppDatabase } from '@/server/database/localDatabase';
import { sessionCookieName } from '@/lib/auth/sessionCookieName';
import { createSession, endSession, findSessionUser } from './authAccounts';

// The session cookie holds a random token. Only its hash is stored, and the cookie
// cannot be read by page scripts.
async function readSessionToken() {
  return (await cookies()).get(sessionCookieName)?.value ?? null;
}

// The signed-in account for this request, read once however many places ask.
export const getSessionUser = cache(async () => {
  const token = await readSessionToken();
  if (!token) return null;
  return findSessionUser(await getAppDatabase(), token);
});

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getAppDatabase(), userId);
  (await cookies()).set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.ALLOW_INSECURE_COOKIES,
    path: '/',
    expires: expiresAt,
  });
}

export async function finishSession() {
  const token = await readSessionToken();
  if (token) await endSession(await getAppDatabase(), token);
  (await cookies()).delete(sessionCookieName);
}
