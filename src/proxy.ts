import type { NextRequest } from 'next/server';
import { guardRoute } from '@/lib/auth/routeGuard';

export function proxy(request: NextRequest) {
  return guardRoute(request);
}

// The guard only sends people without a session to the sign-in page. On the live site
// each time it runs is a request Vercel counts, so it runs only where that helps: page
// visits. It is skipped for
// - files and addresses that need no sign-in: .well-known holds files Android and others
//   read without signing in (assetlinks.json), and __/ is Google sign-in, passed on to
//   Firebase before anyone is signed in;
// - live updates (api/live), which check the session themselves;
// - server actions and link prefetches, which run inside a page already open. Every
//   server action checks who is calling (getActionAccess), and every page checks again
//   when it is opened;
// - every request carrying a session cookie (crm_session, see sessionCookieName). The
//   guard only acts when there is none: signed-in people's pages check the session
//   themselves (requireAccess), and the sign-in pages send them on to the app. So the
//   guard runs only for people who are not signed in, and costs nothing otherwise.
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|sw.js|manifest.webmanifest|images/|\\.well-known/|__/|api/live).*)',
      missing: [
        { type: 'header', key: 'next-action' },
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
        { type: 'cookie', key: 'crm_session' },
      ],
    },
  ],
};
