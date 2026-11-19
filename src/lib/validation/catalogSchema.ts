import { z } from 'zod';
import { serviceBillings } from '@/lib/catalog/servicePricing';

export const serviceGroupSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  isActive: z.boolean(),
});

// A plan price: empty for no price, else rupees with up to two decimals.
const planPrice = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(',', ''))
  .refine((value) => value === '' || /^\d{1,12}(\.\d{1,2})?$/.test(value), 'Enter an amount in rupees, such as 15000.')
  .transform((value) => (value === '' ? null : Number(value)));

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120, 'Use 120 characters or fewer.'),
  groupId: z.uuid('Choose the service it belongs to.'),
  isActive: z.boolean(),
  billing: z.enum(serviceBillings, 'Choose how it is billed.'),
  // Off for work quoted per project, such as a website: clients get no plan for it.
  asksPlan: z.boolean(),
  description: z
    .string()
    .trim()
    .max(500, 'Use 500 characters or fewer.')
    .transform((value) => (value === '' ? null : value)),
  starterPrice: planPrice,
  growthPrice: planPrice,
  premiumPrice: planPrice,
});

// A bundle: its name, the sub services in it and the saving taken off their total.
export const serviceBundleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  serviceIds: z
    .array(z.uuid())
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.uuid()).min(2, 'Choose at least two sub services.').max(20, 'Choose 20 sub services or fewer.')),
  savingPercent: z
    .string()
    .trim()
    .refine((value) => /^\d{1,2}(\.\d{1,2})?$/.test(value) && Number(value) <= 90, 'Enter a saving from 0 to 90 percent.')
    .transform(Number),
  isActive: z.boolean(),
});

export const industrySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  isActive: z.boolean(),
});
