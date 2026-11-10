// Applies each file in database/migrations once, in name order, each in its own
// transaction. A failed migration stops the app from starting rather than leaving
// the database half changed.
import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export async function applyMigrations(db: PGlite, migrationsDir: string) {
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

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(path.join(migrationsDir, file), 'utf8').replace(/^﻿/, '');
    try {
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('insert into app_meta.schema_migrations (version) values ($1)', [version]);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${reason}`);
    }
  }

  await ensureLiveTriggers(db);
}

// Every table in the live_updates publication gets a trigger that tells open pages
// about changes. Adding a table to the publication in a migration is all it takes.
async function ensureLiveTriggers(db: PGlite) {
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
