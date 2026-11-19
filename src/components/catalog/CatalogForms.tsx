'use client';

import { useActionState } from 'react';
import hrStyles from '@/components/hr/HrForms.module.css';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import type { SearchableOption } from '@/components/ui/SearchableSelect';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { billingLabels, serviceBillings, servicePlans, type ServicePlan } from '@/lib/catalog/servicePricing';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { saveIndustryAction, saveServiceAction, saveServiceBundleAction, saveServiceGroupAction } from '@/server/actions/catalogActions';
import styles from './CatalogForms.module.css';

type Entry = { id: string; name: string; is_active: boolean };

type EntryFormProps = {
  entry?: Entry;
  label: string;
  idPrefix: string;
  save: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  children?: React.ReactNode;
};

// One row of a list: its name, whether it can still be chosen, and Save. The blank
// version adds a new entry and clears itself afterwards.
function EntryForm({ entry, label, idPrefix, save, children }: EntryFormProps) {
  const [result, formAction] = useActionState(save, idleResult);
  const prefix = `${idPrefix}-${entry?.id ?? 'new'}`;

  return (
    <KeepValuesForm action={formAction} key={!entry && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={hrStyles.inline}>
        <TextField label={label} name="name" id={`${prefix}-name`} defaultValue={entry?.name} required error={result.fieldErrors?.name} />
        {children}
        {entry && (
          <label className={hrStyles.check}>
            <input type="checkbox" name="isActive" defaultChecked={entry.is_active} /> Can be chosen
          </label>
        )}
        <SubmitButton label={entry ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}

export function ServiceGroupForm({ group }: { group?: Entry }) {
  return <EntryForm entry={group} label="Service" idPrefix="group" save={saveServiceGroupAction.bind(null, group?.id ?? null)} />;
}

type PricedEntry = Entry & {
  billing: string;
  asks_plan: boolean;
  description: string | null;
  starter_price: number | string | null;
  growth_price: number | string | null;
  premium_price: number | string | null;
};

const billingOptions = serviceBillings.map((billing) => ({ value: billing, label: billingLabels[billing] }));
const priceText = (value: number | string | null | undefined) => (value === null || value === undefined ? '' : String(Number(value)));

// A sub service with how it is billed and its three plan prices. A plan left empty is
// not offered on quotations and invoices.
export function ServiceForm({ service, groupId, groups }: { service?: PricedEntry; groupId: string; groups: SelectOption[] }) {
  const prefix = `service-${service?.id ?? `new-${groupId}`}`;
  const [result, formAction] = useActionState(saveServiceAction.bind(null, service?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction} key={!service && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.rows}>
      <div className={hrStyles.inline}>
        <TextField label="Sub service" name="name" id={`${prefix}-name`} defaultValue={service?.name} required error={errors?.name} />
        {service ? (
          <SelectField label="Under service" name="groupId" id={`${prefix}-group`} options={groups} defaultValue={groupId} />
        ) : (
          <input type="hidden" name="groupId" value={groupId} />
        )}
        <SelectField label="Billed" name="billing" id={`${prefix}-billing`} options={billingOptions} defaultValue={service?.billing ?? 'monthly'} error={errors?.billing} />
      </div>
      <TextField
        label="Description on quotations and invoices"
        name="description"
        id={`${prefix}-description`}
        defaultValue={service?.description ?? ''}
        maxLength={500}
        placeholder="What the client gets, in a sentence"
        error={errors?.description}
      />
      <div className={hrStyles.inline}>
        {servicePlans.map((plan) => (
          <TextField
            key={plan.key}
            label={`${plan.label} (₹)`}
            name={`${plan.key}Price`}
            id={`${prefix}-${plan.key}`}
            inputMode="decimal"
            defaultValue={priceText(service?.[`${plan.key}_price`])}
            placeholder="No price"
            error={errors?.[`${plan.key}Price`]}
          />
        ))}
        {/* Off for work quoted per project, such as a website: no plan on clients, and
            the rate on a quotation starts empty. */}
        <label className={hrStyles.check}>
          <input type="checkbox" name="asksPlan" defaultChecked={service?.asks_plan ?? true} /> Choose a plan for clients
        </label>
        {service && (
          <label className={hrStyles.check}>
            <input type="checkbox" name="isActive" defaultChecked={service.is_active} /> Can be chosen
          </label>
        )}
        <SubmitButton label={service ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
      </div>
    </KeepValuesForm>
  );
}

type BundleEntry = Entry & {
  saving_percent: number;
  services: { id: string; name: string }[];
  prices: Record<ServicePlan, number | null>;
};

// A bundle: its name, its sub services (printed on the item in this order) and the
// saving taken off their total. Its plan prices are worked out from the sub services'.
export function ServiceBundleForm({ bundle, serviceOptions }: { bundle?: BundleEntry; serviceOptions: SearchableOption[] }) {
  const prefix = `bundle-${bundle?.id ?? 'new'}`;
  const [result, formAction] = useActionState(saveServiceBundleAction.bind(null, bundle?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction} key={!bundle && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.rows}>
        <div className={hrStyles.inline}>
          <TextField label="Bundle" name="name" id={`${prefix}-name`} defaultValue={bundle?.name} required error={errors?.name} />
          <TextField
            label="Saving (%)"
            name="savingPercent"
            id={`${prefix}-saving`}
            inputMode="decimal"
            defaultValue={bundle ? String(bundle.saving_percent) : '10'}
            required
            error={errors?.savingPercent}
          />
        </div>
        <SearchableMultiSelect
          id={`${prefix}-services`}
          name="serviceIds"
          label="Sub services in it"
          options={serviceOptions}
          defaultValue={bundle?.services.map((service) => service.id)}
          hint="Printed on the item in the order added, such as “SEO + Social Media Management”."
          error={errors?.serviceIds}
        />
        {bundle && (
          <p className={styles.prices}>
            {servicePlans.map((plan) => (
              <span key={plan.key}>
                {plan.label}: <strong>{bundle.prices[plan.key] === null ? 'No price' : formatRupees(bundle.prices[plan.key] ?? 0)}</strong>
              </span>
            ))}
          </p>
        )}
        <div className={hrStyles.inline}>
          {bundle && (
            <label className={hrStyles.check}>
              <input type="checkbox" name="isActive" defaultChecked={bundle.is_active} /> Can be chosen
            </label>
          )}
          <SubmitButton label={bundle ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
        </div>
      </div>
    </KeepValuesForm>
  );
}

export function IndustryForm({ industry }: { industry?: Entry }) {
  return <EntryForm entry={industry} label="Industry" idPrefix="industry" save={saveIndustryAction.bind(null, industry?.id ?? null)} />;
}
