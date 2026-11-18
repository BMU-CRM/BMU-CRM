import 'server-only';
import {
  bundleDescription,
  bundlePlanPrice,
  isServiceBilling,
  servicePlans,
  type PricedService,
  type ServicePlan,
} from '@/lib/catalog/servicePricing';
import { createDatabaseClient } from '@/server/database/databaseClient';

// The services (in groups) and industries clients choose from.

const toPrice = (value: number | string | null) => (value === null ? null : Number(value));

const byName =(first: { name: string }, second: { name: string }) => first.name.localeCompare(second.name, 'en', { sensitivity: 'base' });

export async function getCatalog() {
  const database = await createDatabaseClient();
  const [groups, services, industries, bundles] = await Promise.all([
    database.from('service_groups').select('id, name, sort_order, is_active').order('sort_order').order('name'),
    database.from('services').select('id, group_id, name, is_active, billing, description, starter_price, growth_price, premium_price'),
    database.from('industries').select('id, name, is_active'),
    database.from('service_bundles').select('id, name, service_ids, saving_percent, is_active, sort_order').order('sort_order').order('name'),
  ]);
  if (groups.error) throw groups.error;
  if (services.error) throw services.error;
  if (industries.error) throw industries.error;
  if (bundles.error) throw bundles.error;

  const serviceById = new Map(services.data.map((service) => [service.id, service]));

  return {
    groups: groups.data.map((group) => ({
      ...group,
      services: services.data.filter((service) => service.group_id === group.id).sort(byName),
    })),
    industries: [...industries.data].sort(byName),
    // Each bundle with its sub services, in order, and its price for each plan.
    bundles: bundles.data.map((bundle) => {
      const members = bundle.service_ids.flatMap((id) => serviceById.get(id) ?? []);
      const savingPercent = Number(bundle.saving_percent);
      const prices = Object.fromEntries(
        servicePlans.map((plan) => [plan.key, bundlePlanPrice(members.map((member) => toPrice(member[`${plan.key}_price`])), savingPercent)]),
      ) as Record<ServicePlan, number | null>;
      return { ...bundle, saving_percent: savingPercent, services: members.map((member) => ({ id: member.id, name: member.name })), prices };
    }),
  };
}

export type CatalogBundle = Catalog['bundles'][number];

export type Catalog = Awaited<ReturnType<typeof getCatalog>>;

// In the app, a service group is called a "service" and a service a "sub service".

// Services (the groups) for a picker, alphabetical. Hidden ones are left out unless the
// record already uses them.
export async function listServiceGroupOptions(keepIds: string[] = []) {
  const { groups } = await getCatalog();
  return groups
    .filter((group) => group.is_active || keepIds.includes(group.id))
    .sort(byName)
    .map((group) => ({ value: group.id, label: group.name }));
}

// Sub services for a picker: under their service's heading, services and sub services
// both alphabetical. Hidden ones are left out unless the record already uses them.
export async function listServiceOptions(keepIds: string[] = []) {
  const { groups } = await getCatalog();
  return [...groups].sort(byName).flatMap((group) =>
    group.services
      .filter((service) => (service.is_active && group.is_active) || keepIds.includes(service.id))
      .map((service) => ({
        value: service.id,
        label: service.name,
        group: group.name,
        groupId: group.id,
        billing: isServiceBilling(service.billing) ? service.billing : 'monthly',
        prices: { starter: toPrice(service.starter_price), growth: toPrice(service.growth_price), premium: toPrice(service.premium_price) },
      })),
  );
}

export type SubServiceOption = Awaited<ReturnType<typeof listServiceOptions>>[number];

// Sub services with at least one plan price, for quotation and invoice items: under
// their service, both alphabetical. Hidden ones are left out.
// Bundles that can be chosen and have a price for at least one plan come last, under
// "Bundle".
export async function listPricedServices(): Promise<PricedService[]> {
  const { groups, bundles } = await getCatalog();
  const services: PricedService[] = [...groups]
    .filter((group) => group.is_active)
    .sort(byName)
    .flatMap((group) =>
      group.services
        .filter((service) => service.is_active && [service.starter_price, service.growth_price, service.premium_price].some((price) => price !== null))
        .map((service) => ({
          id: service.id,
          name: service.name,
          group: group.name,
          billing: isServiceBilling(service.billing) ? service.billing : 'monthly',
          description: service.description,
          prices: { starter: toPrice(service.starter_price), growth: toPrice(service.growth_price), premium: toPrice(service.premium_price) },
        })),
    );
  const pricedBundles: PricedService[] = bundles
    .filter((bundle) => bundle.is_active && Object.values(bundle.prices).some((price) => price !== null))
    .map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      group: 'Bundle',
      billing: 'bundle',
      description: bundleDescription(bundle.services.map((service) => service.name)),
      prices: bundle.prices,
      isBundle: true,
    }));
  return [...services, ...pricedBundles];
}

export type ClientServiceItem = {
  description: string;
  serviceGroup: string;
  serviceName: string;
  billing: string;
  unitPrice: string;
};

// The services each client takes (not ended), as quotation and invoice items: the sub
// service with the client's plan, its service, how it is billed, its description and
// the plan's price (or, with no plan chosen, the lowest plan priced) to start from.
export async function listClientServiceItems(clientIds: string[]): Promise<Record<string, ClientServiceItem[]>> {
  if (clientIds.length === 0) return {};
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('client_services')
    .select(
      'client_id, service_name, status, plan, created_at, service:services(name, billing, description, starter_price, growth_price, premium_price, group:service_groups(name))',
    )
    .in('client_id', clientIds)
    .neq('status', 'ended')
    .order('created_at');
  if (error) throw error;

  const items: Record<string, ClientServiceItem[]> = {};
  for (const row of data) {
    const service = row.service;
    const prices = { starter: service?.starter_price, growth: service?.growth_price, premium: service?.premium_price };
    const plan = row.plan === 'starter' || row.plan === 'growth' || row.plan === 'premium' ? row.plan : null;
    // The client's plan, else the lowest plan that has a price.
    const price = plan && prices[plan] !== null && prices[plan] !== undefined ? prices[plan] : Object.values(prices).find((value) => value !== null && value !== undefined);
    const planLabel = plan ? servicePlans.find((option) => option.key === plan)?.label : null;
    const name = service?.name ?? row.service_name;
    (items[row.client_id] ??= []).push({
      description: service?.description ?? name,
      serviceGroup: service?.group?.name ?? '',
      serviceName: planLabel ? `${name} (${planLabel} plan)` : name,
      billing: service && isServiceBilling(service.billing) ? service.billing : '',
      unitPrice: price === undefined || price === null ? '' : String(Number(price)),
    });
  }
  return items;
}

// Industries for a picker, alphabetical. A hidden industry stays if the client has it.
export async function listIndustryOptions(keepId?: string | null) {
  const { industries } = await getCatalog();
  return industries
    .filter((industry) => industry.is_active || industry.id === keepId)
    .map((industry) => ({ value: industry.id, label: industry.name }));
}
