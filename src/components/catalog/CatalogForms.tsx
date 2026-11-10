'use client';

import { useActionState } from 'react';
import hrStyles from '@/components/hr/HrForms.module.css';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { saveIndustryAction, saveServiceAction, saveServiceGroupAction } from '@/server/actions/catalogActions';

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

export function ServiceForm({ service, groupId, groups }: { service?: Entry; groupId: string; groups: SelectOption[] }) {
  const prefix = `service-${service?.id ?? `new-${groupId}`}`;
  return (
    <EntryForm entry={service} label="Sub service" idPrefix={`service-${groupId}`} save={saveServiceAction.bind(null, service?.id ?? null)}>
      {service ? (
        <SelectField label="Under service" name="groupId" id={`${prefix}-group`} options={groups} defaultValue={groupId} />
      ) : (
        <input type="hidden" name="groupId" value={groupId} />
      )}
    </EntryForm>
  );
}

export function IndustryForm({ industry }: { industry?: Entry }) {
  return <EntryForm entry={industry} label="Industry" idPrefix="industry" save={saveIndustryAction.bind(null, industry?.id ?? null)} />;
}
