// Slows down password guessing: at most 10 attempts per email in 15 minutes. Counted
// in the database, because on Vercel many copies of the app run at once and a count
// kept in memory would be split between them.
import type { SqlDatabase } from '@/server/database/sqlDatabase';

const windowMinutes = 15;
const maxAttempts = 10;

export async function isRateLimited(db: SqlDatabase, key: string) {
  const normalised = key.trim().toLowerCase();
  // Records this attempt and counts the earlier ones in one step. Attempts older than
  // a day are cleared on the way, so the table stays small.
  const { rows } = await db.query<{ earlier: number }>(
    `with recorded as (insert into app_auth.sign_in_attempts (key) values ($1) returning 1),
          cleared as (delete from app_auth.sign_in_attempts where attempted_at < now() - interval '1 day' returning 1)
     select count(*)::int as earlier from app_auth.sign_in_attempts
     where key = $1 and attempted_at > now() - make_interval(mins => $2)`,
    [normalised, windowMinutes],
  );
  return (rows[0]?.earlier ?? 0) + 1 > maxAttempts;
}
