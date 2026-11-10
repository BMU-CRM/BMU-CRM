// Decides whether a Google account may sign in. Only people who already have a login
// (an invited employee, or a client once the client portal exists) are let in. The
// first Google sign-in links that Google account to the login; after that, no other
// Google account can use it, even one with the same email address.
import type { SqlDatabase, SqlRunner } from '@/server/database/sqlDatabase';
import type { GoogleIdentity } from './firebaseTokens';

export type GoogleSignIn =
  | { status: 'ok'; userId: string }
  | { status: 'not-invited' }
  | { status: 'blocked' }
  | { status: 'other-google-account' };

async function writeAuditEntry(
  tx: SqlRunner,
  entry: { userId: string | null; action: string; email: string; reason?: string },
) {
  const employee = entry.userId
    ? (
        await tx.query<{ id: string; full_name: string }>(
          'select id, full_name from public.employees where auth_user_id = $1',
          [entry.userId],
        )
      ).rows[0]
    : undefined;

  await tx.query(
    `insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
     values ($1, $2, $3, 'google_account', $4, $5::jsonb)`,
    [
      employee?.id ?? null,
      employee?.full_name ?? 'System',
      entry.action,
      entry.userId,
      JSON.stringify({ label: entry.email, ...(entry.reason ? { reason: entry.reason } : {}) }),
    ],
  );
}

export async function signInWithGoogleIdentity(db: SqlDatabase, identity: GoogleIdentity): Promise<GoogleSignIn> {
  return db.transaction(async (tx) => {
    const refuse = async (status: Exclude<GoogleSignIn['status'], 'ok'>, userId: string | null) => {
      await writeAuditEntry(tx, { userId, action: 'refused', email: identity.email, reason: status });
      return { status } as GoogleSignIn;
    };

    const user = (
      await tx.query<{ id: string; banned: boolean }>(
        `select id, coalesce(banned_until > now(), false) as banned from app_auth.users where email = $1 for update`,
        [identity.email],
      )
    ).rows[0];
    if (!user) return refuse('not-invited', null);
    if (user.banned) return refuse('blocked', user.id);

    const links = (
      await tx.query<{ provider_user_id: string; user_id: string }>(
        `select provider_user_id, user_id from app_auth.user_identities
         where provider = 'google' and (user_id = $1 or provider_user_id = $2)`,
        [user.id, identity.googleId],
      )
    ).rows;
    if (links.some((link) => link.user_id !== user.id || link.provider_user_id !== identity.googleId)) {
      return refuse('other-google-account', user.id);
    }

    if (links.length === 0) {
      await tx.query(
        `insert into app_auth.user_identities (provider, provider_user_id, user_id, email) values ('google', $1, $2, $3)`,
        [identity.googleId, user.id, identity.email],
      );
      await writeAuditEntry(tx, { userId: user.id, action: 'linked', email: identity.email });
    } else {
      await tx.query(
        `update app_auth.user_identities set last_used_at = now(), email = $3
         where provider = 'google' and provider_user_id = $1 and user_id = $2`,
        [identity.googleId, user.id, identity.email],
      );
    }

    // Signing in with Google proves the address, so an open invitation counts as accepted.
    await tx.query(
      `update app_auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1`,
      [user.id],
    );
    await tx.query(
      `update public.employees set invite_accepted_at = now() where auth_user_id = $1 and invite_accepted_at is null`,
      [user.id],
    );
    await writeAuditEntry(tx, { userId: user.id, action: 'signed in with', email: identity.email });
    return { status: 'ok', userId: user.id };
  });
}
