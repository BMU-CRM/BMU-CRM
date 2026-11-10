'use server';

import { revalidatePath } from 'next/cache';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { industrySchema, serviceGroupSchema, serviceSchema } from '@/lib/validation/catalogSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refresh() {
  revalidatePath('/settings/services');
  revalidatePath('/clients', 'layout');
}

export async function saveServiceGroupAction(groupId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.catalogManage))) return failure(noPermission);

  const parsed = serviceGroupSchema.safeParse({
    name: formData.get('name') ?? '',
    isActive: groupId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = groupId
    ? await database.from('service_groups').update(row).eq('id', groupId).select('id')
    : await database.from('service_groups').insert({ ...row, sort_order: 1000 }).select('id');

  if (error) return databaseFailure(error, 'A service with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refresh();
  return success(groupId ? 'Service saved.' : 'Service added.');
}

export async function saveServiceAction(serviceId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.catalogManage))) return failure(noPermission);

  const parsed = serviceSchema.safeParse({
    name: formData.get('name') ?? '',
    groupId: formData.get('groupId') ?? '',
    isActive: serviceId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, group_id: parsed.data.groupId, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = serviceId
    ? await database.from('services').update(row).eq('id', serviceId).select('id')
    : await database.from('services').insert(row).select('id');

  if (error) return databaseFailure(error, 'A sub service with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refresh();
  return success(serviceId ? 'Sub service saved.' : 'Sub service added.');
}

export async function saveIndustryAction(industryId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.catalogManage))) return failure(noPermission);

  const parsed = industrySchema.safeParse({
    name: formData.get('name') ?? '',
    isActive: industryId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = { name: parsed.data.name, is_active: parsed.data.isActive };
  const database = await createDatabaseClient();
  const { data, error } = industryId
    ? await database.from('industries').update(row).eq('id', industryId).select('id')
    : await database.from('industries').insert(row).select('id');

  if (error) return databaseFailure(error, 'An industry with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refresh();
  return success(industryId ? 'Industry saved.' : 'Industry added.');
}
