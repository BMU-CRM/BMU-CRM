// Sign-in accounts, sessions and one-time links. These tables sit outside the public
// schema, so only trusted server code can reach them, never a user's query.
import type { SqlDatabase } from '@/server/database/sqlDatabase';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwordHashing';

const sessionDays = 30;
const linkHours = { invite: 24 * 7, recovery: 1 } as const;

export type LinkKind = keyof typeof linkHours;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

export class EmailTakenError extends Error {
  constructor() {
    super('This email already has a login.');
  }
}

export async function findAuthUserByEmail(db: SqlDatabase, email: string) {
  const { rows } = await db.query<{ id: string; banned: boolean }>(
    `select id, coalesce(banned_until > now(), false) as banned from app_auth.users where email = $1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function createAuthUser(
  db: SqlDatabase,
  account: { email: string; password?: string; fullName?: string },
) {
  const email = account.email.trim().toLowerCase();
  const passwordHash = account.password ? await hashPassword(account.password) : null;
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into app_auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, case when $2::text is null then null else now() end, jsonb_build_object('full_name', $3::text))
       returning id`,
      [email, passwordHash, account.fullName ?? null],
    );
    if (!rows[0]) throw new Error('The login could not be created.');
    return rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new EmailTakenError();
    throw error;
  }
}

export async function deleteAuthUser(db: SqlDatabase, userId: string) {
  await db.query('delete from app_auth.users where id = $1', [userId]);
}

export async function setAuthUserPassword(db: SqlDatabase, userId: string, password: string) {
  await db.query(
    `update app_auth.users set encrypted_password = $2, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
     where id = $1`,
    [userId, await hashPassword(password)],
  );
}

// A blocked account cannot sign in. Its open sessions lose all data access at once,
// because the app treats a blocked account as signed out of the database, and the
// person sees that their account is inactive.
export async function setAuthUserBlocked(db: SqlDatabase, userId: string, blocked: boolean) {
  await db.query(`update app_auth.users set banned_until = $2, updated_at = now() where id = $1`, [
    userId,
    blocked ? 'infinity' : null,
  ]);
}

export type PasswordCheck = { status: 'ok'; userId: string } | { status: 'invalid' } | { status: 'blocked' };

export async function checkPassword(db: SqlDatabase, email: string, password: string): Promise<PasswordCheck> {
  const { rows } = await db.query<{ id: string; encrypted_password: string | null; banned: boolean }>(
    `select id, encrypted_password, coalesce(banned_until > now(), false) as banned from app_auth.users where email = $1`,
    [email.trim().toLowerCase()],
  );
  const user = rows[0];
  // A made-up hash keeps the time the same whether or not the email exists.
  const matches = await verifyPassword(password, user?.encrypted_password ?? 'scrypt$16384$8$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !matches) return { status: 'invalid' };
  if (user.banned) return { status: 'blocked' };
  return { status: 'ok', userId: user.id };
}

export async function createSession(db: SqlDatabase, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.query('insert into app_auth.sessions (user_id, token_hash, expires_at) values ($1, $2, $3)', [
      userId,
      hashToken(token),
      expiresAt.toISOString(),
    ]);
    await tx.query('update app_auth.users set last_sign_in_at = now() where id = $1', [userId]);
    await tx.query('delete from app_auth.sessions where expires_at < now()');
  });
  return { token, expiresAt };
}

export async function findSessionUser(db: SqlDatabase, token: string) {
  const { rows } = await db.query<{ user_id: string; email: string; banned: boolean }>(
    `select s.user_id, u.email, coalesce(u.banned_until > now(), false) as banned
     from app_auth.sessions s join app_auth.users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? { userId: rows[0].user_id, email: rows[0].email, blocked: rows[0].banned } : null;
}

export async function endSession(db: SqlDatabase, token: string) {
  await db.query('delete from app_auth.sessions where token_hash = $1', [hashToken(token)]);
}

// Creates an invitation or password reset link token. Older unused links of the same
// kind stop working, so only the newest one is valid.
export async function createOneTimeLink(db: SqlDatabase, userId: string, kind: LinkKind) {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.query(`update app_auth.one_time_tokens set used_at = now() where user_id = $1 and kind = $2 and used_at is null`, [
      userId,
      kind,
    ]);
    await tx.query(
      `insert into app_auth.one_time_tokens (user_id, kind, token_hash, expires_at)
       values ($1, $2, $3, now() + make_interval(hours => $4))`,
      [userId, kind, hashToken(token), linkHours[kind]],
    );
  });
  return token;
}

// Each link works once. Returns who it was for, or null if it is used or expired.
export async function redeemOneTimeLink(db: SqlDatabase, token: string, kind: LinkKind) {
  const { rows } = await db.query<{ user_id: string }>(
    `update app_auth.one_time_tokens set used_at = now()
     where token_hash = $1 and kind = $2 and used_at is null and expires_at > now()
     returning user_id`,
    [hashToken(token), kind],
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;

  const user = await db.query<{ banned: boolean }>(
    'select coalesce(banned_until > now(), false) as banned from app_auth.users where id = $1',
    [userId],
  );
  return user.rows[0] && !user.rows[0].banned ? userId : null;
}

export async function queueEmail(
  db: SqlDatabase,
  email: { to: string; kind: string; subject: string; body: string; link?: string },
) {
  await db.query(
    'insert into app_auth.outgoing_emails (to_email, kind, subject, body, link) values ($1, $2, $3, $4, $5)',
    [email.to.toLowerCase(), email.kind, email.subject, email.body, email.link ?? null],
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[email to ${email.to}] ${email.subject}${email.link ? `: ${email.link}` : ''}`);
  }
}

// The newest unexpired link emailed to someone, for administrators to pass on while
// no email provider is connected.
export async function latestEmailedLink(db: SqlDatabase, email: string, kind: LinkKind) {
  const { rows } = await db.query<{ link: string; created_at: string }>(
    `select e.link, e.created_at from app_auth.outgoing_emails e
     where e.to_email = $1 and e.kind = $2 and e.link is not null
       and e.created_at > now() - make_interval(hours => $3)
     order by e.created_at desc limit 1`,
    [email.toLowerCase(), kind, linkHours[kind]],
  );
  return rows[0] ?? null;
}
