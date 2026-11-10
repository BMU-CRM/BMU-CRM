// A hosted Postgres reached over the network, such as Supabase. Used on Vercel, where
// the app has no disk of its own to keep an embedded database on.
import pg from 'pg';
import type { SqlDatabase, SqlRunner } from './sqlDatabase';

// Whole numbers stored as bigint come back as numbers, as they do from the embedded
// database, unless they are too large to hold exactly.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
});

export type PostgresDatabase = SqlDatabase & { close(): Promise<void> };

// The connection is always encrypted. An sslmode in the address would replace these
// settings, so it is removed. The certificate is not checked against a list of known
// authorities, because Supabase signs its own.
function connectionSettings(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}

function runner(target: pg.Pool | pg.PoolClient): SqlRunner {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await target.query(sql, params);
      return { rows: result.rows as T[], affectedRows: result.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await target.query(sql);
    },
  };
}

export function openPostgresDatabase(connectionString: string, options: { maxConnections?: number } = {}): PostgresDatabase {
  const pool = new pg.Pool({
    ...connectionSettings(connectionString),
    max: options.maxConnections ?? 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (error) => console.error('A database connection failed', error));

  return {
    ...runner(pool),
    async transaction<T>(work: (tx: SqlRunner) => Promise<T>) {
      const client = await pool.connect();
      let broken: Error | undefined;
      try {
        await client.query('begin');
        const result = await work(runner(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch((rollbackError: Error) => {
          broken = rollbackError;
        });
        throw error;
      } finally {
        // A connection that could not roll back is closed rather than reused.
        client.release(broken);
      }
    },
    close: () => pool.end(),
  };
}
