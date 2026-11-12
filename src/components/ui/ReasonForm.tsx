'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, TextAreaField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';

type ReasonFormProps = {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  label: string;
  hint: string;
  submitLabel: string;
  backHref: string;
};

// Asks why before removing or cancelling something that stays on record.
export function ReasonForm({ action, label, hint, submitLabel, backHref }: ReasonFormProps) {
  const [result, formAction] = useActionState(action, idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <TextAreaField label={label} name="reason" rows={3} required hint={hint} error={result.fieldErrors?.reason} />
      <FormActions>
        <SubmitButton label={submitLabel} pendingLabel="Saving…" variant="danger" />
        <ButtonLink href={backHref} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
