import 'server-only';
import { getSessionUser } from '@/server/auth/currentSession';
import { getAppDatabase, type Identity } from './localDatabase';
import { createQueryClient } from './queryClients';

export type { DatabaseClient } from './queryClients';

// Acts as the signed-in user, so row level security applies to every query.
// Without a session, or with a blocked account, it acts as an anonymous visitor.
export async function createDatabaseClient() {
  const user = await getSessionUser();
  const identity: Identity = user && !user.blocked ? { role: 'authenticated', userId: user.userId } : { role: 'anon' };
  return createQueryClient(getAppDatabase, identity);
}

// Bypasses row level security. Use only for trusted work the user cannot do
// themselves, and only after checking their permission.
export function createAdminDatabaseClient() {
  return createQueryClient(getAppDatabase, { role: 'service_role' });
}
