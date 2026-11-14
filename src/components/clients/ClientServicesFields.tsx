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
  prices?: Record<ServicePlan, number | null>;
};

type ClientServicesFieldsProps = {
  services: PickerOption[];
  subServices: SubServicePickerOption[];
  defaultSubServiceIds: string[];
  // The plan of each sub service the client already has.
  defaultPlans?: Record<string, string>;
  serviceError?: string;
  subServiceError?: string;
};

// Step 1 chooses the services (such as Web & AI). Step 2 then offers only their sub
// services (such as Website Design). Removing a service removes its sub services.
export function ClientServicesFields({
  services,
  subServices,
  defaultSubServiceIds,
  defaultPlans = {},
  serviceError,
  subServiceError,
}: ClientServicesFieldsProps) {
  const groupOf = (subId: string) => subServices.find((sub) => sub.value === subId)?.groupId;
  const [chosenServices, setChosenServices] = useState<string[]>(() => [
    ...new Set(defaultSubServiceIds.flatMap((id) => groupOf(id) ?? [])),
  ]);
  const [chosenSubs, setChosenSubs] = useState<string[]>(defaultSubServiceIds.filter((id) => groupOf(id)));
  const [plans, setPlans] = useState<Record<string, string>>(defaultPlans);

  const available = subServices.filter((sub) => chosenServices.includes(sub.groupId));
  const stillNeeded = services.filter(
    (service) => chosenServices.includes(service.value) && !chosenSubs.some((id) => groupOf(id) === service.value),
  );

  // After a failed save, the messages follow what is chosen now, so an error that has
  // been put right disappears and the one still open names the services concerned.
  const neededNames = listInWords(stillNeeded.map((service) => service.label));
  const serviceErrorNow = chosenServices.length === 0 ? serviceError : undefined;
  const subServiceErrorNow = subServiceError
    ? stillNeeded.length
      ? `Choose at least one sub service for ${neededNames}.`
      : chosenSubs.length === 0
        ? subServiceError
        : undefined
    : undefined;

  function changeServices(next: string[]) {
    setChosenServices(next);
    setChosenSubs((current) => current.filter((id) => next.includes(groupOf(id) ?? '')));
  }

  return (
    <div className={layout.stack}>
      <SearchablePicker
        id="serviceGroupIds"
        name="serviceGroupIds"
        label="Services"
        options={services}
        multiple
        required
        value={chosenServices}
        onChange={changeServices}
        placeholder="Type to search, for example Web or Marketing"
        hint="Step 1. Choose every service the client needs."
        error={serviceErrorNow}
      />
      <SearchablePicker
        id="serviceIds"
        name="serviceIds"
        label="Sub services"
        options={available}
        multiple
        required
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
      {chosenSubs.length > 0 && (
        <fieldset className={styles.plans}>
          <legend className={formStyles.label}>Plans</legend>
          <p className={formStyles.hint}>Step 3. The plan the client takes for each sub service. Quotations and invoices use its price.</p>
          {chosenSubs.map((id) => {
            const sub = subServices.find((option) => option.value === id);
            if (!sub) return null;
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
                  <span className={formStyles.hint}>No prices set for this sub service</span>
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
