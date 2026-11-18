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
import { industrySchema, serviceBundleSchema, serviceGroupSchema, serviceSchema } from '@/lib/validation/catalogSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refresh() {
  revalidatePath('/settings/services');
  revalidatePath('/clients', 'layout');
  revalidatePath('/quotations', 'layout');
  revalidatePath('/invoices', 'layout');
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
    billing: formData.get('billing') || 'monthly',
    description: formData.get('description') ?? '',
    starterPrice: formData.get('starterPrice') ?? '',
    growthPrice: formData.get('growthPrice') ?? '',
    premiumPrice: formData.get('premiumPrice') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = {
    name: parsed.data.name,
    group_id: parsed.data.groupId,
    is_active: parsed.data.isActive,
    billing: parsed.data.billing,
    description: parsed.data.description,
    starter_price: parsed.data.starterPrice,
    growth_price: parsed.data.growthPrice,
    premium_price: parsed.data.premiumPrice,
  };
  const database = await createDatabaseClient();
  const { data, error } = serviceId
    ? await database.from('services').update(row).eq('id', serviceId).select('id')
    : await database.from('services').insert(row).select('id');

  if (error) return databaseFailure(error, 'A sub service with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refresh();
  return success(serviceId ? 'Sub service saved.' : 'Sub service added.');
}

// A bundle keeps the order its sub services were added in, which is the order printed
// on the item: those kept stay where they were, new ones go at the end.
export async function saveServiceBundleAction(bundleId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.catalogManage))) return failure(noPermission);

  const parsed = serviceBundleSchema.safeParse({
    name: formData.get('name') ?? '',
    serviceIds: formData.getAll('serviceIds').map(String),
    savingPercent: formData.get('savingPercent') ?? '',
    isActive: bundleId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  let serviceIds = parsed.data.serviceIds;
  if (bundleId) {
    const { data: current } = await database.from('service_bundles').select('service_ids').eq('id', bundleId).maybeSingle();
    if (current) {
      const chosen = new Set(serviceIds);
      const kept = current.service_ids.filter((id) => chosen.has(id));
      serviceIds = [...kept, ...serviceIds.filter((id) => !kept.includes(id))];
    }
  }

  const row = { name: parsed.data.name, service_ids: serviceIds, saving_percent: parsed.data.savingPercent, is_active: parsed.data.isActive };
  const { data, error } = bundleId
    ? await database.from('service_bundles').update(row).eq('id', bundleId).select('id')
    : await database.from('service_bundles').insert({ ...row, sort_order: 1000 }).select('id');

  if (error) return databaseFailure(error, 'A bundle with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refresh();
  return success(bundleId ? 'Bundle saved.' : 'Bundle added.');
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
