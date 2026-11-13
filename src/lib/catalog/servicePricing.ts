// Sub service prices: how each is billed and its three plans. Prices are in rupees,
// before GST. Used by Settings and by quotation and invoice items.

export const serviceBillings = ['monthly', 'one_time', 'per_unit'] as const;
export type ServiceBilling = (typeof serviceBillings)[number];

export const billingLabels: Record<ServiceBilling, string> = {
  monthly: 'Per month',
  one_time: 'One time',
  per_unit: 'Per unit (shoot, session or campaign)',
};

// Short form, as shown next to a price and on an item.
export const billingShort: Record<ServiceBilling, string> = {
  monthly: 'per month',
  one_time: 'one time',
  per_unit: 'per unit',
};

export const servicePlans = [
  { key: 'starter', label: 'Starter' },
  { key: 'growth', label: 'Growth' },
  { key: 'premium', label: 'Premium' },
] as const;
export type ServicePlan = (typeof servicePlans)[number]['key'];

export type PricedService = {
  id: string;
  name: string;
  group: string;
  billing: ServiceBilling;
  prices: Record<ServicePlan, number | null>;
};

export function isServiceBilling(value: string): value is ServiceBilling {
  return (serviceBillings as readonly string[]).includes(value);
}

// The item description a picked sub service and plan fill in, such as
// "SEO — Growth plan (per month)".
export function serviceItemDescription(service: PricedService, plan: ServicePlan) {
  const planLabel = servicePlans.find((option) => option.key === plan)?.label ?? plan;
  return `${service.name} — ${planLabel} plan (${billingShort[service.billing]})`;
}
