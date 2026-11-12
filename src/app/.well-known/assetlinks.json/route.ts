// Tells Android that the BMU Workspace app may open this site full-screen, without a
// browser bar (Digital Asset Links). The app's package name and signing fingerprints come
// from PWABuilder and are set in the server settings, so no code change is needed when
// they change:
//   ANDROID_APP_PACKAGE      such as in.bmumarketing.crm.twa
//   ANDROID_APP_SHA256       one or more SHA-256 fingerprints, separated by commas
// Neither is secret: Android reads this file publicly.

export const dynamic = 'force-dynamic';

export function GET() {
  const packageName = process.env.ANDROID_APP_PACKAGE?.trim();
  const fingerprints = (process.env.ANDROID_APP_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

  const statements =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
          },
        ]
      : [];

  return Response.json(statements, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
