import type { NextRequest } from 'next/server';
import { guardRoute } from '@/lib/auth/routeGuard';

export function proxy(request: NextRequest) {
  return guardRoute(request);
}

export const config = {
  // .well-known holds files Android and others read without signing in (assetlinks.json).
  // __/ is Google sign-in, passed on to Firebase before anyone is signed in.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|sw.js|manifest.webmanifest|images/|\\.well-known/|__/).*)'],
};
