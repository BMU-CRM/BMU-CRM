'use client';

import { useActionState } from 'react';
import { FormActions, SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { createGroupConversationAction, startDirectConversationAction } from '@/server/actions/messageActions';

export function DirectMessageForm({ people }: { people: SelectOption[] }) {
  const [result, formAction] = useActionState(startDirectConversationAction, idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <SelectField label="Person" name="employeeId" id="direct-person" options={people} placeholder="Choose someone" required error={result.fieldErrors?.employeeId} />
      <FormActions>
        <SubmitButton label="Open conversation" pendingLabel="Opening…" />
      </FormActions>
    </KeepValuesForm>
  );
}

export function GroupConversationForm({ people }: { people: SelectOption[] }) {
  const [result, formAction] = useActionState(createGroupConversationAction, idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <TextField label="Group name" name="title" id="group-title" required error={result.fieldErrors?.title} />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <SearchableMultiSelect
          id="group-members"
          name="memberIds"
          label="Members"
          options={people}
          hint="Tick everyone to add. You are added automatically."
          error={result.fieldErrors?.memberIds}
        />
      </div>
      <FormActions>
        <SubmitButton label="Create group" pendingLabel="Creating…" />
      </FormActions>
    </KeepValuesForm>
  );
}
