// The database the running app uses. On this computer it is the embedded database in
// .data/database. On Vercel, DATABASE_PROVIDER=supabase points it at Supabase instead.
import type { SqlDatabase } from './sqlDatabase';

export type DatabaseProvider = 'local' | 'supabase';

export function databaseProvider(): DatabaseProvider {
  return process.env.DATABASE_PROVIDER === 'supabase' ? 'supabase' : 'local';
}

// The same key the app has always used, so a running development server reloading
// this code keeps its open database instead of opening the folder a second time.
const globalKey = Symbol.for('crm.localDatabase');
type GlobalWithDatabase = typeof globalThis & { [globalKey]?: Promise<SqlDatabase> };

async function openLocal(): Promise<SqlDatabase> {
  const { defaultDatabaseOptions, openDatabase } = await import('./localDatabase');
  const db = await openDatabase(defaultDatabaseOptions());
  // Loaded here so tests and scripts that open their own database never start them.
  const { startBackgroundServices } = await import('./backgroundServices');
  await startBackgroundServices(db);
  return db;
}

// Migrations are applied with npm run db:supabase, not here, because many copies of
// the app can start at once on Vercel. Scheduled jobs and push requests run inside
// Supabase itself (pg_cron and pg_net), so nothing runs in the background here.
async function openSupabase(): Promise<SqlDatabase> {
  const address = process.env.SUPABASE_DB_POOLER_URL;
  if (!address) throw new Error('DATABASE_PROVIDER is supabase, but SUPABASE_DB_POOLER_URL is not set.');

  const { openPostgresDatabase } = await import('./postgresDatabase');
  const db = openPostgresDatabase(address);
  await configureHostedDispatch(db);
  return db;
}

// Supabase sends push requests over the web, so it needs this app's address and the
// shared secret that proves a request came from the database. Saved only when changed.
async function configureHostedDispatch(db: SqlDatabase) {
  const url = process.env.NOTIFICATION_DISPATCH_URL;
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  if (!url || !secret) return;

  const { rows } = await db.query<{ key: string; value: string }>(
    `select key, value from private.app_settings where key in ('notification_dispatch_url', 'notification_dispatch_secret')`,
  );
  const saved = new Map(rows.map((row) => [row.key, row.value]));
  if (saved.get('notification_dispatch_url') === url && saved.get('notification_dispatch_secret') === secret) return;
  await db.query('select public.configure_notification_dispatch($1, $2)', [url, secret]);
}

// Shared by everything in this process. Kept on globalThis so that reloading code in
// development reuses it instead of opening the database twice.
export function getAppDatabase(): Promise<SqlDatabase> {
  const holder = globalThis as GlobalWithDatabase;

  holder[globalKey] ??= (databaseProvider() === 'supabase' ? openSupabase() : openLocal()).catch((error: unknown) => {
    delete holder[globalKey];
    throw error;
  });

  return holder[globalKey];
}
