// Applies each file in database/migrations once, in name order, each in its own
// transaction. A failed migration stops the app from starting rather than leaving
// the database half changed.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SqlDatabase } from './sqlDatabase';

// Where the migrations run. Supabase already provides most of what the first
// migration builds for the embedded database, so it gets its own version of that one.
export type MigrationPlatform = 'local' | 'supabase';

const platformMigration = '20261106000000_local_platform';

// Supabase keeps its own sign-in accounts in auth.users. This app's accounts live in
// app_auth.users there from the start (the embedded database moves them there in a
// later migration), so links to them point at that table instead.
function adaptForSupabase(sql: string) {
  return sql.replaceAll('references auth.users', 'references app_auth.users');
}

function readMigration(migrationsDir: string, file: string, platform: MigrationPlatform) {
  const version = file.replace(/\.sql$/, '');
  const source =
    platform === 'supabase' && version === platformMigration
      ? path.join(migrationsDir, '..', 'platform', 'supabase_platform.sql')
      : path.join(migrationsDir, file);
  const sql = readFileSync(source, 'utf8').replace(/^﻿/, '');
  return platform === 'supabase' ? adaptForSupabase(sql) : sql;
}

// Returns the versions it applied, in order.
export async function applyMigrations(db: SqlDatabase, migrationsDir: string, platform: MigrationPlatform = 'local') {
  await db.exec(`
    create schema if not exists app_meta;
    create table if not exists app_meta.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await db.query<{ version: string }>('select version from app_meta.schema_migrations')).rows.map((row) => row.version),
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readMigration(migrationsDir, file, platform);
    try {
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('insert into app_meta.schema_migrations (version) values ($1)', [version]);
      });
      newlyApplied.push(version);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${reason}`);
    }
  }

  await ensureLiveTriggers(db);
  return newlyApplied;
}

// Every table in the live_updates publication gets a trigger that tells open pages
// about changes. Adding a table to the publication in a migration is all it takes.
async function ensureLiveTriggers(db: SqlDatabase) {
  const { rows } = await db.query<{ tablename: string }>(
    `select tablename from pg_publication_tables where pubname = 'live_updates' and schemaname = 'public'`,
  );
  for (const { tablename } of rows) {
    await db.exec(
      `create or replace trigger zz_live_broadcast after insert or update or delete on public."${tablename.replaceAll('"', '""')}"
       for each row execute function live.broadcast_change()`,
    );
  }
}
