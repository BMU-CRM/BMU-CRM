// What the app needs from a Postgres connection. Two kinds provide it: the embedded
// database used on this computer (PGlite) and a hosted Postgres reached over the
// network (Supabase, see postgresDatabase.ts). Code written against these types runs
// unchanged on both.

export type SqlResult<T> = { rows: T[]; affectedRows?: number };

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
  // Runs one or more statements without parameters, as migrations need.
  exec(sql: string): Promise<unknown>;
}

export interface SqlDatabase extends SqlRunner {
  transaction<T>(work: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

export type Identity =
  | { role: 'anon' }
  | { role: 'authenticated'; userId: string }
  | { role: 'service_role' };

// Runs work in one transaction as the given database role, so row level security
// applies exactly as it would for that user. Nothing outside the callback sees the
// role or user, because both are local to the transaction.
export async function runAs<T>(db: SqlDatabase, identity: Identity, work: (tx: SqlRunner) => Promise<T>) {
  return db.transaction(async (tx) => {
    // One statement instead of two, which saves a round trip to a hosted database.
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', $2, true)`, [
      identity.role === 'authenticated' ? identity.userId : '',
      identity.role,
    ]);
    return work(tx);
  });
}
