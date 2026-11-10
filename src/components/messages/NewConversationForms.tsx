'use client';

import { useActionState } from 'react';
import { FormActions, SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
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
      <div className={formStyles.field} style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="group-members" className={formStyles.label}>
          Members
        </label>
        <select id="group-members" name="memberIds" multiple size={8} className={formStyles.control}>
          {people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </select>
        {result.fieldErrors?.memberIds ? (
          <p className={formStyles.error}>{result.fieldErrors.memberIds}</p>
        ) : (
          <p className={formStyles.hint}>Hold Ctrl, or Cmd on a Mac, to choose several. You are added automatically.</p>
        )}
      </div>
      <FormActions>
        <SubmitButton label="Create group" pendingLabel="Creating…" />
      </FormActions>
    </KeepValuesForm>
  );
}
