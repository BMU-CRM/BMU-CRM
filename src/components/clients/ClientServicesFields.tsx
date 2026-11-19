'use client';

import { useState } from 'react';
import { SearchablePicker, type PickerOption } from '@/components/ui/SearchablePicker';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import formStyles from '@/components/ui/FormFields.module.css';
import { billingShort, servicePlans, type ServiceBilling, type ServicePlan } from '@/lib/catalog/servicePricing';
import { listInWords } from '@/lib/clients/serviceSelection';
import { formatRupees } from '@/lib/finance/moneyFormat';
import styles from './ClientServicesFields.module.css';

export type SubServicePickerOption = PickerOption & {
  groupId: string;
  billing?: ServiceBilling;
  // False for work quoted per project: no plan is chosen for it.
  asksPlan?: boolean;
  prices?: Record<ServicePlan, number | null>;
};

// A bundle, such as Brand Launch, with its sub services as the description.
export type BundlePickerOption = SubServicePickerOption & { description?: string };

type ClientServicesFieldsProps = {
  services: PickerOption[];
  subServices: SubServicePickerOption[];
  bundles?: BundlePickerOption[];
  defaultSubServiceIds: string[];
  defaultBundleIds?: string[];
  // The plan of each sub service and bundle the client already has.
  defaultPlans?: Record<string, string>;
  serviceError?: string;
  subServiceError?: string;
  bundleError?: string;
};

// Step 1 chooses the services (such as Web & AI). Step 2 then offers only their sub
// services (such as Website Design). Removing a service removes its sub services.
// Bundles (such as Brand Launch) can be chosen as well, or instead of them. Step 3 sets
// the plan of each.
export function ClientServicesFields({
  services,
  subServices,
  bundles = [],
  defaultSubServiceIds,
  defaultBundleIds = [],
  defaultPlans = {},
  serviceError,
  subServiceError,
  bundleError,
}: ClientServicesFieldsProps) {
  const groupOf = (subId: string) => subServices.find((sub) => sub.value === subId)?.groupId;
  const [chosenServices, setChosenServices] = useState<string[]>(() => [
    ...new Set(defaultSubServiceIds.flatMap((id) => groupOf(id) ?? [])),
  ]);
  const [chosenSubs, setChosenSubs] = useState<string[]>(defaultSubServiceIds.filter((id) => groupOf(id)));
  const [chosenBundles, setChosenBundles] = useState<string[]>(defaultBundleIds.filter((id) => bundles.some((bundle) => bundle.value === id)));
  const [plans, setPlans] = useState<Record<string, string>>(defaultPlans);

  const available = subServices.filter((sub) => chosenServices.includes(sub.groupId));
  const stillNeeded = services.filter(
    (service) => chosenServices.includes(service.value) && !chosenSubs.some((id) => groupOf(id) === service.value),
  );

  // After a failed save, the messages follow what is chosen now, so an error that has
  // been put right disappears and the one still open names the services concerned.
  const neededNames = listInWords(stillNeeded.map((service) => service.label));
  const serviceErrorNow = chosenServices.length === 0 && chosenBundles.length === 0 ? serviceError : undefined;
  const subServiceErrorNow = subServiceError
    ? stillNeeded.length
      ? `Choose at least one sub service for ${neededNames}.`
      : chosenSubs.length === 0 && chosenServices.length > 0
        ? subServiceError
        : undefined
    : undefined;

  function changeServices(next: string[]) {
    setChosenServices(next);
    setChosenSubs((current) => current.filter((id) => next.includes(groupOf(id) ?? '')));
  }

  // Each chosen sub service that asks for a plan, then each chosen bundle, with its plan.
  const planned = [
    ...chosenSubs.flatMap((id) => subServices.find((option) => option.value === id && option.asksPlan !== false) ?? []),
    ...chosenBundles.flatMap((id) => {
      const bundle = bundles.find((option) => option.value === id);
      return bundle ? [{ ...bundle, label: `Bundle › ${bundle.label}` }] : [];
    }),
  ];

  return (
    <div className={layout.stack}>
      <SearchablePicker
        id="serviceGroupIds"
        name="serviceGroupIds"
        label="Services"
        options={services}
        multiple
        required={chosenBundles.length === 0}
        value={chosenServices}
        onChange={changeServices}
        placeholder="Type to search, for example Web or Marketing"
        hint="Step 1. Choose every service the client needs, or choose a bundle below."
        error={serviceErrorNow}
      />
      <SearchablePicker
        id="serviceIds"
        name="serviceIds"
        label="Sub services"
        options={available}
        multiple
        required={chosenServices.length > 0}
        value={chosenSubs}
        onChange={setChosenSubs}
        placeholder={chosenServices.length ? 'Type to search, for example SEO or Website' : 'Choose services first'}
        emptyMessage="Choose services first. Their sub services appear here."
        hint={
          stillNeeded.length
            ? `Step 2. Still to choose: a sub service for ${neededNames}.`
            : 'Step 2. Choose at least one sub service for each service.'
        }
        error={subServiceErrorNow}
      />
      {bundles.length > 0 && (
        <SearchablePicker
          id="bundleIds"
          name="bundleIds"
          label="Bundles"
          options={bundles}
          multiple
          value={chosenBundles}
          onChange={setChosenBundles}
          placeholder="Type to search, for example Brand Launch"
          hint="Optional. Sub services sold together as one monthly project."
          error={bundleError}
        />
      )}
      {planned.length > 0 && (
        <fieldset className={styles.plans}>
          <legend className={formStyles.label}>Plans</legend>
          <p className={formStyles.hint}>Step 3. The plan the client takes for each sub service and bundle. Quotations and invoices use its price.</p>
          {planned.map((sub) => {
            const id = sub.value;
            const priced = servicePlans.filter((plan) => sub.prices?.[plan.key] !== null && sub.prices?.[plan.key] !== undefined);
            return (
              <div key={id} className={styles.planRow}>
                <label htmlFor={`plan-${id}`} className={styles.planName}>
                  {sub.label}
                </label>
                {priced.length > 0 ? (
                  <select
                    id={`plan-${id}`}
                    className={formStyles.control}
                    value={plans[id] ?? ''}
                    onChange={(event) => setPlans((current) => ({ ...current, [id]: event.target.value }))}
                  >
                    <option value="">Not chosen</option>
                    {priced.map((plan) => (
                      <option key={plan.key} value={plan.key}>
                        {plan.label} · {formatRupees(sub.prices?.[plan.key] ?? 0)} {sub.billing ? billingShort[sub.billing] : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={formStyles.hint}>No prices set for this {sub.groupId ? 'sub service' : 'bundle'}</span>
                )}
                {plans[id] && <input type="hidden" name="servicePlan" value={`${id}:${plans[id]}`} />}
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
