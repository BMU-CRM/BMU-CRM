import { NextResponse, type NextRequest } from 'next/server';
import { redeemOneTimeLink, type LinkKind } from '@/server/auth/authAccounts';
import { startSession } from '@/server/auth/currentSession';
import { getAppDatabase } from '@/server/database/localDatabase';

const allowedKinds: LinkKind[] = ['invite', 'recovery'];

// Opens an invitation or password reset link. Each link works once: it signs the
// person in and takes them to choose a password.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const kind = request.nextUrl.searchParams.get('type') as LinkKind | null;
  const url = request.nextUrl.clone();
  url.search = '';

  if (token && kind && allowedKinds.includes(kind)) {
    const userId = await redeemOneTimeLink(await getAppDatabase(), token, kind);
    if (userId) {
      await startSession(userId);
      url.pathname = '/set-password';
      return NextResponse.redirect(url);
    }
  }

  url.pathname = '/login';
  url.searchParams.set('error', 'link-expired');
  return NextResponse.redirect(url);
}
