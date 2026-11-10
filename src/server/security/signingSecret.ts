// A random secret created the first time the app runs and kept in the database's
// private settings. It signs short-lived file links and checks push requests.
import type { SqlDatabase } from '@/server/database/sqlDatabase';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secrets = new WeakMap<SqlDatabase, Promise<string>>();

// Reads a random value from the private settings, creating it the first time.
export async function loadSecret(db: SqlDatabase, key: string) {
  await db.query(
    `insert into private.app_settings (key, value) values ($1, $2) on conflict (key) do nothing`,
    [key, randomBytes(32).toString('hex')],
  );
  const { rows } = await db.query<{ value: string }>('select value from private.app_settings where key = $1', [key]);
  if (!rows[0]) throw new Error('The signing secret could not be created.');
  return rows[0].value;
}

export function getSigningSecret(db: SqlDatabase) {
  let secret = secrets.get(db);
  if (!secret) {
    secret = loadSecret(db, 'signing_secret');
    secrets.set(db, secret);
  }
  return secret;
}

// A token that carries a small JSON payload, signed so it cannot be altered, and
// valid until the expiry inside it.
export async function signToken(db: SqlDatabase, payload: Record<string, unknown>, lifetimeSeconds: number) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }),
  ).toString('base64url');
  const signature = createHmac('sha256', await getSigningSecret(db)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export async function readToken<T extends Record<string, unknown>>(db: SqlDatabase, token: string): Promise<T | null> {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = createHmac('sha256', await getSigningSecret(db)).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
