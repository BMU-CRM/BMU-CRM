// Sub service prices: how each is billed and its three plans. Prices are in rupees,
// before GST. Used by Settings and by quotation and invoice items.

export const serviceBillings = ['monthly', 'one_time', 'per_unit'] as const;
export type ServiceBilling = (typeof serviceBillings)[number];

export const billingLabels: Record<ServiceBilling, string> = {
  monthly: 'Per month',
  one_time: 'One time',
  per_unit: 'Per unit (shoot, session or campaign)',
};

// How a quotation or invoice item is billed: as a sub service is, or as a bundle of them.
export const itemBillings = [...serviceBillings, 'bundle'] as const;
export type ItemBilling = (typeof itemBillings)[number];

// Short form, as shown next to a price and on an item.
export const billingShort: Record<ItemBilling, string> = {
  monthly: 'per month',
  one_time: 'one time',
  per_unit: 'per unit',
  bundle: 'bundle',
};

export const servicePlans = [
  { key: 'starter', label: 'Starter' },
  { key: 'growth', label: 'Growth' },
  { key: 'premium', label: 'Premium' },
] as const;
export type ServicePlan = (typeof servicePlans)[number]['key'];

// A sub service or a bundle, as quotation and invoice items are picked from.
export type PricedService = {
  id: string;
  name: string;
  // The service it is under; "Bundle" for a bundle.
  group: string;
  billing: ItemBilling;
  // What the client gets, printed under the item. For a bundle, its sub services.
  description: string | null;
  prices: Record<ServicePlan, number | null>;
  isBundle?: boolean;
};

// How an item is billed, as printed on quotations and invoices.
export const itemBillingLabels: Record<ItemBilling, string> = {
  monthly: 'Monthly',
  one_time: 'One-time project',
  per_unit: 'Per unit',
  bundle: 'Bundle',
};

export function isItemBilling(value: string): value is ItemBilling {
  return (itemBillings as readonly string[]).includes(value);
}

// A bundle's price for a plan: its sub services' prices for that plan added up, less
// the saving. Null when any of them has no price for the plan, so it is not offered.
export function bundlePlanPrice(prices: (number | null)[], savingPercent: number) {
  if (prices.length === 0 || prices.some((price) => price === null)) return null;
  const fullPaise = prices.reduce<number>((total, price) => total + Math.round((price ?? 0) * 100), 0);
  return Math.round((fullPaise * (100 - savingPercent)) / 100) / 100;
}

// "SEO + Social Media Management", as a bundle's item description.
export function bundleDescription(serviceNames: string[]) {
  return serviceNames.join(' + ');
}

// The sub service name an item carries, with its plan, such as "SEO (Growth plan)".
export function serviceItemName(service: PricedService, plan: ServicePlan) {
  const planLabel = servicePlans.find((option) => option.key === plan)?.label ?? plan;
  return `${service.name} (${planLabel} plan)`;
}

export function isServiceBilling(value: string): value is ServiceBilling {
  return (serviceBillings as readonly string[]).includes(value);
}

// The item description a picked sub service and plan fill in: its description from the
// price list, else "SEO — Growth plan (per month)".
export function serviceItemDescription(service: PricedService, plan: ServicePlan) {
  if (service.description) return service.description;
  const planLabel = servicePlans.find((option) => option.key === plan)?.label ?? plan;
  return `${service.name} — ${planLabel} plan (${billingShort[service.billing]})`;
}
