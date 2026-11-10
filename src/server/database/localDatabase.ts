// The app's database: Postgres running inside this Node process, stored in a folder.
// There is no separate server to install. One process opens the folder at a time;
// a lock file stops a second one, because two writers would corrupt the data.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyMigrations } from './migrationRunner';

export type DatabaseOptions = {
  // A folder path, or 'memory://' for a throwaway database used by tests.
  dataDir: string;
  migrationsDir: string;
};

const globalKey = Symbol.for('crm.localDatabase');
type GlobalWithDatabase = typeof globalThis & { [globalKey]?: Promise<PGlite> };

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

// The shared database for the running app. Kept on globalThis so that reloading code
// in development reuses it instead of opening the folder twice.
export function getAppDatabase(): Promise<PGlite> {
  const holder = globalThis as GlobalWithDatabase;

  holder[globalKey] ??= (async () => {
    const db = await openDatabase(defaultDatabaseOptions());
    // Loaded here so tests and scripts that open their own database never start them.
    const { startBackgroundServices } = await import('./backgroundServices');
    await startBackgroundServices(db);
    return db;
  })().catch((error: unknown) => {
    delete holder[globalKey];
    throw error;
  });

  return holder[globalKey];
}

export type Identity =
  | { role: 'anon' }
  | { role: 'authenticated'; userId: string }
  | { role: 'service_role' };

// Runs work in one transaction as the given database role, so row level security
// applies exactly as it would for that user. Nothing outside the callback sees
// the role or user, because both are local to the transaction.
export async function runAs<T>(db: PGlite, identity: Identity, work: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      identity.role === 'authenticated' ? identity.userId : '',
    ]);
    await tx.exec(`set local role ${identity.role}`);
    return work(tx);
  });
}
