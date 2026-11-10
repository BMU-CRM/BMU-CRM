import 'server-only';
import { todayInIndia } from '@/lib/formatDate';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { calculateWorkload, type WorkloadRow } from '@/lib/tasks/calculateWorkload';

export async function getWorkloads() {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_workload_rows');
  if (error) throw error;

  return calculateWorkload(data as WorkloadRow[], todayInIndia());
}

// The signed-in person's own workload, for their dashboard. Anyone can see their own.
export async function getMyWorkload() {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_my_workload_rows');
  if (error) throw error;

  return calculateWorkload(data as WorkloadRow[], todayInIndia())[0] ?? null;
}
