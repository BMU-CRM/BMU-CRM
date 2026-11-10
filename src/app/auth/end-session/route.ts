import { NextResponse, type NextRequest } from 'next/server';
import { finishSession } from '@/server/auth/currentSession';

// Clears a session that has ended, for example after an account was blocked or the
// session expired, and returns to the sign-in page.
export async function GET(request: NextRequest) {
  await finishSession();
  return NextResponse.redirect(new URL('/login', request.url));
}
