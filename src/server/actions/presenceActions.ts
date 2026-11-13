'use server';

import { z } from 'zod';
import { databaseFailure, failure, success, type ActionResult } from '@/lib/actionResult';
import { isPresenceStatus, type PresenceStatus } from '@/lib/presence/presenceStatus';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';


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

// One request does both jobs, so an open app costs one request a minute, not three:
// - checks in, when `active` is given. "Active" means the person used the app in the
//   last few minutes; otherwise they show as away. Null only reads.
// - returns the statuses of the colleagues shown on the page, when any are asked for.
export async function presencePulseAction(active: boolean | null, employeeIds: string[]): Promise<PresenceSnapshot> {
  const parsed = idsSchema.safeParse(employeeIds);
  if (!parsed.success) return {};
  if (active === null && parsed.data.length === 0) return {};
  if (!(await getActionAccess())) return {};

  const database = await createDatabaseClient();
  if (active !== null) await database.rpc('record_presence', { p_active: active === true });
  if (parsed.data.length === 0) return {};

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
