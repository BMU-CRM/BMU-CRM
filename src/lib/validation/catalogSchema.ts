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
  starterPrice: planPrice,
  growthPrice: planPrice,
  premiumPrice: planPrice,
});

export const industrySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  isActive: z.boolean(),
});
