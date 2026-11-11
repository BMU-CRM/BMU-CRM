'use server';

import { z } from 'zod';
import { databaseFailure, failure, success, type ActionResult } from '@/lib/actionResult';
import { isPresenceStatus, type PresenceStatus } from '@/lib/presence/presenceStatus';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

// The app checks in about once a minute while it is open. "Active" means the person
// used it in the last few minutes; otherwise they show as away.
export async function recordPresenceAction(active: boolean): Promise<void> {
  if (!(await getActionAccess())) return;
  const database = await createDatabaseClient();
  await database.rpc('record_presence', { p_active: active === true });
}

// Null resets to the status worked out from activity.
export async function setMyStatusAction(
  status: PresenceStatus | null,
): Promise<ActionResult & { shown?: PresenceStatus }> {
  if (!(await getActionAccess())) return failure('Your account is not active.');
  if (status !== null && !isPresenceStatus(status)) return failure('Choose a valid status.');

  const database = await createDatabaseClient();
  // The generated types do not know the argument may be empty; the database accepts it.
  const { data, error } = await database.rpc('set_my_status', { p_status: status as string });
  if (error) return databaseFailure(error);

  return { ...success('Status updated.'), shown: isPresenceStatus(data) ? data : 'available' };
}

const idsSchema = z.array(z.uuid()).max(500);

export type PresenceSnapshot = Record<string, { status: PresenceStatus; chosen: PresenceStatus | null }>;

export async function getPresenceAction(employeeIds: string[]): Promise<PresenceSnapshot> {
  const parsed = idsSchema.safeParse(employeeIds);
  if (!parsed.success || parsed.data.length === 0) return {};
  if (!(await getActionAccess())) return {};

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_presence', { p_employees: parsed.data });
  if (error) return {};

  return Object.fromEntries(
    data.map((row) => [
      row.employee_id,
      {
        status: isPresenceStatus(row.status) ? row.status : 'offline',
        chosen: isPresenceStatus(row.chosen_status) ? row.chosen_status : null,
      },
    ]),
  );
}
