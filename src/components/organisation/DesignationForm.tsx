'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { saveDesignationAction } from '@/server/actions/organisationActions';

type DesignationFormProps = {
  designation?: { id: string; title: string; management_level: number };
};

export function DesignationForm({ designation }: DesignationFormProps) {
  const [result, formAction] = useActionState(saveDesignationAction.bind(null, designation?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Title" name="title" defaultValue={designation?.title} required error={errors?.title} />
        <TextField
          label="Management level"
          name="managementLevel"
          type="number"
          min={1}
          max={20}
          defaultValue={designation?.management_level ?? 5}
          required
          hint="1 is the most senior."
          error={errors?.managementLevel}
        />
      </FormGrid>
      <FormActions>
        <SubmitButton label={designation ? 'Save changes' : 'Add designation'} pendingLabel="Saving…" />
        {designation && (
          <ButtonLink href="/people/designations" variant="ghost">
            Cancel
          </ButtonLink>
        )}
      </FormActions>
    </KeepValuesForm>
  );
}
