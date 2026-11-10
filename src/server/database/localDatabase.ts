// The embedded database: Postgres running inside this Node process, stored in a folder.
// There is no separate server to install. One process opens the folder at a time;
// a lock file stops a second one, because two writers would corrupt the data.
import { PGlite } from '@electric-sql/pglite';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyMigrations } from './migrationRunner';

export type DatabaseOptions = {
  // A folder path, or 'memory://' for a throwaway database used by tests.
  dataDir: string;
  migrationsDir: string;
};

export function defaultDatabaseOptions(): DatabaseOptions {
  // Decided when the app runs, so the bundler is told not to look inside these.
  const root = /* turbopackIgnore: true */ process.cwd();
  const configured = process.env.DATABASE_DIR;
  return {
    dataDir:
      configured === 'memory://' ? configured : path.resolve(/* turbopackIgnore: true */ root, configured || '.data/database'),
    migrationsDir: path.resolve(/* turbopackIgnore: true */ root, 'database/migrations'),
  };
}

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claimLock(dataDir: string) {
  const lockFile = `${dataDir}.lock`;
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, 'utf8'));
    if (pid && pid !== process.pid && processIsRunning(pid)) {
      throw new Error(
        `The database in ${dataDir} is already open in another program (process ${pid}). ` +
          'Stop that program first, for example the running npm run dev.',
      );
    }
  }
  writeFileSync(lockFile, String(process.pid));
  process.once('exit', () => {
    try {
      if (readFileSync(lockFile, 'utf8') === String(process.pid)) rmSync(lockFile);
    } catch {
      // Already gone.
    }
  });
}

export async function openDatabase(options: DatabaseOptions) {
  const inMemory = options.dataDir === 'memory://';
  if (!inMemory) {
    mkdirSync(path.dirname(options.dataDir), { recursive: true });
    claimLock(options.dataDir);
  }

  const db = await PGlite.create(inMemory ? undefined : options.dataDir);
  await db.exec(`set timezone = 'UTC'`);
  await applyMigrations(db, options.migrationsDir);
  return db;
}
