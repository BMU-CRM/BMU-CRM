// Each test file gets its own throwaway database in memory, built from the real
// migrations. Tests sign in as real users through the same query engine the app
// uses, which proves the rules hold even for someone calling the database directly.
import type { PGlite } from '@electric-sql/pglite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPassword, createAuthUser } from '@/server/auth/authAccounts';
import { openDatabase } from '@/server/database/localDatabase';
import type { Identity } from '@/server/database/sqlDatabase';
import { createQueryClient, type DatabaseClient } from '@/server/database/queryClients';
import { canReadObject, putObject } from '@/server/storage/objectStore';

export type Client = DatabaseClient;

let database: Promise<PGlite> | null = null;
const storageFolder = mkdtempSync(path.join(tmpdir(), 'crm-test-files-'));
const identities = new WeakMap<Client, Identity>();

export function testDatabase() {
  database ??= openDatabase({ dataDir: 'memory://', migrationsDir: path.resolve('database/migrations') });
  return database;
}

function clientFor(identity: Identity): Client {
  const client = createQueryClient(testDatabase, identity);
  identities.set(client, identity);
  return client;
}

export const anonymousClient = (): Client => clientFor({ role: 'anon' });
export const adminClient = (): Client => clientFor({ role: 'service_role' });

export const testPassword = 'TestPassword123';

export async function createLogin(email: string, password = testPassword) {
  return createAuthUser(await testDatabase(), { email, password });
}

export async function signIn(email: string, password = testPassword): Promise<Client> {
  const result = await checkPassword(await testDatabase(), email, password);
  if (result.status !== 'ok') throw new Error(`Could not sign in as ${email}: ${result.status}`);
  return clientFor({ role: 'authenticated', userId: result.userId });
}

// Uploads file contents as this client's user, through the same rules as the app.
export async function uploadAs(client: Client, objectName: string, content: string, contentType: string) {
  try {
    await putObject(
      await testDatabase(),
      identities.get(client) ?? { role: 'anon' },
      { bucket: 'files', name: objectName, contentType, body: Buffer.from(content) },
      storageFolder,
    );
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

// Whether this client's user would be given a download link for the stored file.
export async function canDownload(client: Client, objectName: string) {
  try {
    return await canReadObject(await testDatabase(), identities.get(client) ?? { role: 'anon' }, 'files', objectName);
  } catch {
    return false;
  }
}

export function createTestPeople(runId: number) {
  const admin = adminClient();
  const ids: Record<string, string> = {};
  const clients: Record<string, Client> = {};

  async function roleId(name: string) {
    const { data } = await admin.from('roles').select('id').eq('name', name).single();
    return data!.id;
  }

  async function departmentId(name: string) {
    const { data } = await admin.from('departments').select('id').eq('name', name).single();
    return data!.id;
  }

  async function addPerson(key: string, role: string, department: string, managerKey?: string) {
    const email = `${key.toLowerCase()}.${runId}@test.local`;
    const authUserId = await createLogin(email);

    const { data: row, error: rowError } = await admin
      .from('employees')
      .insert({
        auth_user_id: authUserId,
        full_name: `Test ${key}`,
        work_email: email,
        role_id: await roleId(role),
        department_id: await departmentId(department),
        reporting_manager_id: managerKey ? ids[managerKey] : null,
      })
      .select('id')
      .single();
    if (rowError) throw rowError;
    ids[key] = row.id;
    clients[key] = await signIn(email);
  }

  // Each file's database is thrown away afterwards, so there is nothing to clean up.
  async function removeEveryone() {}

  return { admin, ids, clients, roleId, departmentId, addPerson, removeEveryone };
}
