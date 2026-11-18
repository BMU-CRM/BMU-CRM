'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { clientRecordSchema, clientSchema, clientServiceSchema } from '@/lib/validation/clientSchema';
import { bundleChoicePrefix, checkServiceSelection } from '@/lib/clients/serviceSelection';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';
const conflictMessage = 'A client with this company name already exists.';

function clientValues(formData: FormData) {
  return clientSchema.safeParse({
    companyName: formData.get('companyName'),
    contactPerson: formData.get('contactPerson') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    address: formData.get('address') ?? '',
    website: formData.get('website') ?? '',
    status: formData.get('status'),
    onboardingDate: formData.get('onboardingDate') ?? '',
    nextFollowUpDate: formData.get('nextFollowUpDate') ?? '',
    importantNotes: formData.get('importantNotes') ?? '',
    industryId: formData.get('industryId') ?? '',
    serviceGroupIds: formData.getAll('serviceGroupIds').map(String),
    serviceIds: formData.getAll('serviceIds').map(String),
    bundleIds: formData.getAll('bundleIds').map(String),
    clientManagerId: formData.get('clientManagerId') ?? '',
    departmentId: formData.get('departmentId') ?? '',
    gstin: formData.get('gstin') ?? '',
    billingState: formData.get('billingState') ?? '',
  });
}

export async function saveClientAction(
  clientId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const access = await getActionAccess(clientId ? permissionKeys.clientsUpdate : permissionKeys.clientsCreate);
  if (!access) return failure(noPermission);

  const parsed = clientValues(formData);
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();

  // Every chosen service needs a sub service, and every sub service must belong to a
  // chosen service. Checked against the lists, not against what the form says.
  // A client may take only bundles, so any list can be empty; nothing is looked up then.
  const noRows = { data: [], error: null } as const;
  const [subRows, groupRows, bundleRows] = await Promise.all([
    values.serviceIds.length ? database.from('services').select('id, group_id').in('id', values.serviceIds) : noRows,
    values.serviceGroupIds.length ? database.from('service_groups').select('id, name').in('id', values.serviceGroupIds) : noRows,
    values.bundleIds.length ? database.from('service_bundles').select('id').in('id', values.bundleIds) : noRows,
  ]);
  if (subRows.error) return databaseFailure(subRows.error);
  if (groupRows.error) return databaseFailure(groupRows.error);
  if (bundleRows.error) return databaseFailure(bundleRows.error);
  if (subRows.data.length !== new Set(values.serviceIds).size || groupRows.data.length !== new Set(values.serviceGroupIds).size) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { serviceIds: 'Choose from the lists.' } };
  }
  if (bundleRows.data.length !== new Set(values.bundleIds).size) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { bundleIds: 'Choose bundles from the list.' } };
  }
  const selectionProblem = checkServiceSelection(
    values.serviceGroupIds,
    subRows.data.map((sub) => ({ id: sub.id, serviceId: sub.group_id })),
    Object.fromEntries(groupRows.data.map((group) => [group.id, group.name])),
    values.bundleIds.length,
  );
  if (selectionProblem) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { [selectionProblem.field]: selectionProblem.message } };
  }

  const row = {
    company_name: values.companyName,
    contact_person: values.contactPerson,
    email: values.email,
    phone: values.phone,
    address: values.address,
    industry_id: values.industryId,
    website: values.website,
    status: values.status,
    onboarding_date: values.onboardingDate,
    next_follow_up_date: values.nextFollowUpDate,
    important_notes: values.importantNotes,
    client_manager_id: values.clientManagerId,
    department_id: values.departmentId,
    gstin: values.gstin,
    billing_state: values.billingState,
  };

  let savedId = clientId;

  if (clientId) {
    // Services first: the update may hand the client to another manager, after which
    // this person could no longer change them.
    const services = await database.rpc('set_client_services', {
      p_client: clientId,
      p_services: values.serviceIds,
      p_plans: plansFrom(formData),
      p_bundles: values.bundleIds,
    });
    if (services.error) return databaseFailure(services.error);

    const { data, error } = await database.from('clients').update(row).eq('id', clientId).select('id');
    if (error) return databaseFailure(error, conflictMessage);
    if (data.length === 0) return failure(noPermission);
  } else {
    // Whoever adds a client looks after it until someone else is chosen.
    const { data, error } = await database
      .from('clients')
      .insert({ ...row, client_manager_id: row.client_manager_id ?? access.employee.id })
      .select('id')
      .single();
    if (error) return databaseFailure(error, conflictMessage);
    savedId = data.id;

    // The services were checked above, so this only fails if something changed in the
    // meantime. The client is saved either way, so open it to finish there.
    const services = await database.rpc('set_client_services', {
      p_client: data.id,
      p_services: values.serviceIds,
      p_plans: plansFrom(formData),
      p_bundles: values.bundleIds,
    });
    if (services.error) console.error('Could not set the services of a new client', services.error);
  }

  revalidatePath('/clients', 'layout');
  redirect(`/clients/${savedId}`);
}

export async function addClientRecordAction(
  clientId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.clientsUpdate))) return failure(noPermission);

  const parsed = clientRecordSchema.safeParse({
    kind: formData.get('kind'),
    title: formData.get('title'),
    body: formData.get('body') ?? '',
    rating: formData.get('rating') ?? '',
    dueDate: formData.get('dueDate') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { kind, title, body, rating, dueDate } = parsed.data;
  const database = await createDatabaseClient();

  const { error } = await database.from('client_records').insert({
    client_id: clientId,
    kind,
    title,
    body,
    rating: kind === 'feedback' ? rating : null,
    due_date: kind === 'follow_up' ? dueDate : null,
  });

  if (error) return databaseFailure(error);

  revalidatePath(`/clients/${clientId}`);
  return success('Saved.');
}

export async function completeClientRecordAction(clientId: string, recordId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.clientsUpdate))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('client_records')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', recordId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/clients/${clientId}`);
  return success('Marked as done.');
}

export async function deleteClientRecordAction(clientId: string, recordId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.clientsUpdate))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database.from('client_records').delete().eq('id', recordId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/clients/${clientId}`);
  return success('Removed.');
}

// The plan chosen for each sub service or bundle, sent as "servicePlan" fields like
// "<id>:growth".
function plansFrom(formData: FormData) {
  const plans: Record<string, string> = {};
  for (const value of formData.getAll('servicePlan').map(String)) {
    const [serviceId, plan] = value.split(':');
    if (serviceId && (plan === 'starter' || plan === 'growth' || plan === 'premium')) plans[serviceId] = plan;
  }
  return plans;
}

export async function addClientServiceAction(
  clientId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.clientsUpdate))) return failure(noPermission);

  // A bundle is picked as "bundle:<id>", a sub service by its id.
  const picked = String(formData.get('serviceId') ?? '');
  const isBundle = picked.startsWith(bundleChoicePrefix);
  const parsed = clientServiceSchema.safeParse({
    // Checked as an id either way; the database refuses one not in its list.
    serviceId: isBundle ? picked.slice(bundleChoicePrefix.length) : picked,
    status: formData.get('status'),
    startDate: formData.get('startDate') ?? '',
    endDate: formData.get('endDate') ?? '',
    plan: formData.get('plan') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const column = isBundle ? 'bundle_id' : 'service_id';
  const database = await createDatabaseClient();
  const { data: existing } = await database
    .from('client_services')
    .select('id')
    .eq('client_id', clientId)
    .eq(column, parsed.data.serviceId)
    .neq('status', 'ended');
  if (existing?.length) return failure(isBundle ? 'This client already has this bundle.' : 'This client already has this sub service.');

  // The name is filled in by the database from the list.
  const { error } = await database.from('client_services').insert({
    client_id: clientId,
    ...(isBundle ? { bundle_id: parsed.data.serviceId } : { service_id: parsed.data.serviceId }),
    service_name: '',
    plan: parsed.data.plan,
    status: parsed.data.status,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
  });

  if (error) return databaseFailure(error);

  revalidatePath(`/clients/${clientId}`);
  return success('Service added.');
}

export async function deleteClientServiceAction(clientId: string, serviceId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.clientsUpdate))) return failure(noPermission);

  // Every client keeps at least one current service.
  const database = await createDatabaseClient();
  const { data: current } = await database.from('client_services').select('id').eq('client_id', clientId).neq('status', 'ended');
  if ((current ?? []).length === 1 && current?.[0]?.id === serviceId) {
    return failure('A client needs at least one sub service. Add the new one first, then remove this one.');
  }

  const { data, error } = await database.from('client_services').delete().eq('id', serviceId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/clients/${clientId}`);
  return success('Service removed.');
}
