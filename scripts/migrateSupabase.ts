// Sets up or updates the Supabase database: applies every migration in
// database/migrations that it does not have yet. Run with: npm run db:supabase
//
// Reads SUPABASE_DB_SESSION_URL from .env.local. That address keeps one connection
// for the whole run, which migrations need. It never touches the database in .data.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { applyMigrations } from '../src/server/database/migrationRunner';
import { openPostgresDatabase } from '../src/server/database/postgresDatabase';

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');

  const address = process.env.SUPABASE_DB_SESSION_URL;
  if (!address) {
    console.error('SUPABASE_DB_SESSION_URL is not set in .env.local.');
    process.exit(1);
  }

  const db = openPostgresDatabase(address, { maxConnections: 1 });
  try {
    const host = new URL(address).hostname;
    console.log(`Updating the Supabase database at ${host}...`);
    const applied = await applyMigrations(db, path.resolve('database/migrations'), 'supabase');
    if (applied.length === 0) {
      console.log('Already up to date.');
    } else {
      for (const version of applied) console.log(`  applied ${version}`);
      console.log(`Done: ${applied.length} migration${applied.length === 1 ? '' : 's'} applied.`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
