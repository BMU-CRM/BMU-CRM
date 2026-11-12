import type { NextConfig } from 'next';

// Google sign-in pages are served from the site's own address (/__/auth/…), passed on to
// Firebase. In the Android app, sign-in goes to Google and comes back in the same window,
// and Android only lets that finish when it stays on one address. NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
// is then set to the site's own address; Firebase's own one is worked out from the project.
const firebaseProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The embedded database loads its engine files from its own package folder.
  serverExternalPackages: ['@electric-sql/pglite'],
  images: {
    formats: ['image/webp'],
  },
  async rewrites() {
    if (!firebaseProject) return [];
    return [{ source: '/__/auth/:path*', destination: `https://${firebaseProject}.firebaseapp.com/__/auth/:path*` }];
  },
  async headers() {
    return [
      {
        // Not on Firebase's sign-in pages: Firebase shows one of them in a hidden frame.
        source: '/:path((?!__/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
