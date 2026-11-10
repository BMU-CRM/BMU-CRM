// Checks a Firebase ID token: a short-lived signed note from Google saying which
// Google account the person signed in with. The checks follow Firebase's published
// rules for verifying ID tokens without the Firebase Admin SDK, so no secret key is
// needed, only the public project ID.
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

const googleCertificatesUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// Allows for small differences between Google's clock and the server's.
const clockSkewSeconds = 60;
// A sign-in must use a token from a sign-in that just happened, not an old one.
const maxSignInAgeSeconds = 10 * 60;

export type GoogleIdentity = {
  googleId: string;
  email: string;
};

export type TokenCheck = { status: 'ok'; identity: GoogleIdentity } | { status: 'invalid'; reason: string };

export type KeySource = (keyId: string) => Promise<KeyObject | null>;

let cachedKeys: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

// Google rotates its signing keys and says how long each set may be kept.
async function loadGoogleKeys() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;

  const response = await fetch(googleCertificatesUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Google signing keys could not be loaded (${response.status}).`);

  const certificates = (await response.json()) as Record<string, string>;
  const keys = new Map(Object.entries(certificates).map(([id, pem]) => [id, createPublicKey(pem)]));
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cachedKeys = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

export const googleKeySource: KeySource = async (keyId) => {
  let key = (await loadGoogleKeys()).get(keyId);
  if (!key && cachedKeys) {
    // A brand new key may not be in the copy kept, so fetch once more.
    cachedKeys = null;
    key = (await loadGoogleKeys()).get(keyId);
  }
  return key ?? null;
};

function decodePart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  keySource: KeySource = googleKeySource,
  now: number = Date.now(),
): Promise<TokenCheck> {
  const invalid = (reason: string): TokenCheck => ({ status: 'invalid', reason });

  if (typeof token !== 'string' || token.length > 8192) return invalid('malformed');
  const [headerPart, payloadPart, signaturePart, ...extra] = token.split('.');
  if (!signaturePart || extra.length > 0) return invalid('malformed');

  const header = decodePart(headerPart);
  const claims = decodePart(payloadPart);
  if (!header || !claims) return invalid('malformed');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return invalid('wrong algorithm');

  const key = await keySource(header.kid);
  if (!key) return invalid('unknown signing key');
  const signatureOk = createVerify('RSA-SHA256')
    .update(`${headerPart}.${payloadPart}`)
    .verify(key, Buffer.from(signaturePart, 'base64url'));
  if (!signatureOk) return invalid('bad signature');

  const seconds = Math.floor(now / 1000);
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const expires = number(claims.exp);
  const issued = number(claims.iat);
  const signedIn = number(claims.auth_time);

  if (claims.aud !== projectId) return invalid('wrong project');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) return invalid('wrong issuer');
  if (expires === null || expires + clockSkewSeconds < seconds) return invalid('expired');
  if (issued === null || issued - clockSkewSeconds > seconds) return invalid('issued in the future');
  if (signedIn === null || signedIn - clockSkewSeconds > seconds) return invalid('signed in in the future');
  if (seconds - signedIn > maxSignInAgeSeconds) return invalid('sign-in too old');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) return invalid('no user');

  // Only Google sign-in counts, and only with an address Google has confirmed.
  const firebase = claims.firebase as { sign_in_provider?: unknown; identities?: Record<string, unknown> } | undefined;
  if (firebase?.sign_in_provider !== 'google.com') return invalid('not Google');
  if (claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email.includes('@')) {
    return invalid('email not confirmed');
  }
  const googleIds = firebase.identities?.['google.com'];
  const googleId = Array.isArray(googleIds) && typeof googleIds[0] === 'string' ? googleIds[0] : null;
  if (!googleId) return invalid('no Google account id');

  return { status: 'ok', identity: { googleId, email: claims.email.trim().toLowerCase() } };
}
