import type { NextRequest } from 'next/server';
import { guardRoute } from '@/lib/auth/routeGuard';

export function proxy(request: NextRequest) {
  return guardRoute(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|sw.js|manifest.webmanifest|images/).*)'],
};
