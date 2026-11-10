'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import {
  FormActions,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { SearchablePicker, type PickerOption } from '@/components/ui/SearchablePicker';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { stateOptionsWith } from '@/lib/finance/indianStates';
import { clientStatusLabels } from '@/lib/validation/clientSchema';
import { saveClientAction } from '@/server/actions/clientActions';
import { ClientServicesFields, type SubServicePickerOption } from './ClientServicesFields';
import type { ClientDetails } from '@/server/services/clientService';

const statusOptions = Object.entries(clientStatusLabels).map(([value, label]) => ({ value, label }));

type ClientFormProps = {
  client?: ClientDetails;
  // The client's current sub services, when editing.
  serviceIds?: string[];
  managers: SelectOption[];
  departments: SelectOption[];
  industries: PickerOption[];
  serviceGroups: PickerOption[];
  services: SubServicePickerOption[];
};

export function ClientForm({ client, serviceIds = [], managers, departments, industries, serviceGroups, services }: ClientFormProps) {
  const [result, formAction] = useActionState(saveClientAction.bind(null, client?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Company name" name="companyName" defaultValue={client?.company_name} required error={errors?.companyName} />
        <SelectField label="Status" name="status" options={statusOptions} defaultValue={client?.status ?? 'lead'} error={errors?.status} />
        <TextField label="Contact person" name="contactPerson" defaultValue={client?.contact_person ?? ''} error={errors?.contactPerson} />
        <TextField label="Email" name="email" type="email" defaultValue={client?.email ?? ''} error={errors?.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={client?.phone ?? ''} error={errors?.phone} />
        <TextField label="Website" name="website" defaultValue={client?.website ?? ''} error={errors?.website} />
        <SearchablePicker
          id="industryId"
          name="industryId"
          label="Industry"
          options={industries}
          defaultValue={client?.industry_id ?? undefined}
          placeholder="Type to search, for example Real"
          hint={!client?.industry_id && client?.industry ? `Entered before as “${client.industry}”. Choose from the list.` : undefined}
          error={errors?.industryId}
        />
        <SelectField
          label="Client Manager"
          name="clientManagerId"
          options={managers}
          placeholder={client ? 'None' : 'You'}
          defaultValue={client?.client_manager_id ?? ''}
          error={errors?.clientManagerId}
        />
        <SelectField
          label="Assigned department"
          name="departmentId"
          options={departments}
          placeholder="None"
          defaultValue={client?.department_id ?? ''}
          error={errors?.departmentId}
        />
        <TextField label="Onboarding date" name="onboardingDate" type="date" defaultValue={client?.onboarding_date ?? ''} error={errors?.onboardingDate} />
        <TextField label="Next follow-up" name="nextFollowUpDate" type="date" defaultValue={client?.next_follow_up_date ?? ''} error={errors?.nextFollowUpDate} />
        <TextField
          label="GSTIN"
          name="gstin"
          defaultValue={client?.gstin ?? ''}
          maxLength={15}
          hint="Printed on their invoices. Leave empty if they are not registered."
          error={errors?.gstin}
        />
        <SelectField
          label="Billing state"
          name="billingState"
          options={stateOptionsWith(client?.billing_state)}
          placeholder="Not set"
          defaultValue={client?.billing_state ?? ''}
          hint="Decides whether invoices charge CGST and SGST, or IGST."
          error={errors?.billingState}
        />
      </FormGrid>
      <div className={layout.spaced}>
        <ClientServicesFields
          services={serviceGroups}
          subServices={services}
          defaultSubServiceIds={serviceIds}
          serviceError={errors?.serviceGroupIds}
          subServiceError={errors?.serviceIds}
        />
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Address" name="address" rows={2} defaultValue={client?.address ?? ''} error={errors?.address} />
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Important notes" name="importantNotes" defaultValue={client?.important_notes ?? ''} error={errors?.importantNotes} />
      </div>
      <FormActions>
        <SubmitButton label={client ? 'Save changes' : 'Add client'} pendingLabel="Saving…" />
        <ButtonLink href={client ? `/clients/${client.id}` : '/clients'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
