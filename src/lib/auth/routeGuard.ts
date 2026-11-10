import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from './sessionCookieName';

// Pages anyone may open, and addresses called by systems that carry their own proof
// instead of a session: signed file links, and keys for other systems.
const publicPaths = [
  '/login',
  '/forgot-password',
  '/setup',
  '/auth/confirm',
  '/auth/end-session',
  '/api/notifications/dispatch',
  '/api/integrations/attendance',
  '/api/storage/upload',
  '/api/storage/object',
  '/api/test-support',
];

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function redirectTo(request: NextRequest, pathname: string, search = '') {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

// A quick first check that runs before every page. It only looks for the session
// cookie; the server checks the session itself on every request. A cookie whose
// session has ended is cleared by /auth/end-session.
export function guardRoute(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (!hasSession && !isPublicPath(pathname)) {
    const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(request, '/login', next);
  }

  if (hasSession && (pathname === '/login' || pathname === '/forgot-password')) {
    return redirectTo(request, '/overview');
  }

  return NextResponse.next();
}
