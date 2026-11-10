// Query clients for the app's database. Each one runs every query as a fixed database
// role and user, so row level security applies to everything it does.
import { PostgrestClient } from '@supabase/postgrest-js';
import type { Database } from '@/types/databaseTypes';
import type { Identity, SqlDatabase } from './sqlDatabase';
import { handleDatabaseRequest } from './queryEngine';

export type DatabaseClient = PostgrestClient<Database>;

// The address is never contacted. Requests are answered in this process by the
// query engine, which the client reaches through the fetch function below.
const localAddress = 'http://app.database/rest/v1';

export function createQueryClient(
  getDatabase: () => Promise<SqlDatabase>,
  identity: Identity | (() => Promise<Identity>),
): DatabaseClient {
  return new PostgrestClient<Database>(localAddress, {
    fetch: async (input, init) => {
      const [db, who] = await Promise.all([getDatabase(), typeof identity === 'function' ? identity() : identity]);
      return handleDatabaseRequest(db, who, new Request(input, init));
    },
  });
}
