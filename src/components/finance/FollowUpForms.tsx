'use client';

import { useActionState, useState } from 'react';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { followUpStatusLabels, recordableFollowUpStatuses } from '@/lib/validation/followUpSchema';
import { recordFollowUpAction } from '@/server/actions/followUpActions';

export function FollowUpForm({ invoiceId, today, balance }: { invoiceId: string; today: string; balance: number }) {
  const [status, setStatus] = useState<string>('contacted');
  // Counts saved follow-ups, so the form starts empty after each one but keeps what was
  // typed when saving fails.
  const [saved, setSaved] = useState(0);
  const [result, formAction] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const outcome = await recordFollowUpAction(invoiceId, previous, formData);
    if (outcome.status === 'success') {
      setSaved((count) => count + 1);
      setStatus('contacted');
    }
    return outcome;
  }, idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction} key={saved}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField
          label="Where it stands"
          name="status"
          options={recordableFollowUpStatuses.map((value) => ({ value, label: followUpStatusLabels[value] }))}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          error={errors?.status}
        />
        <TextField label="Contacted on" name="contactedOn" type="date" max={today} defaultValue={today} required error={errors?.contactedOn} />
        <TextField label="Next follow-up" name="nextFollowUpOn" type="date" min={today} hint="You get a reminder that morning." error={errors?.nextFollowUpOn} />
        {status === 'promise_to_pay' && (
          <>
            <TextField label="Promised to pay by" name="promisedOn" type="date" required error={errors?.promisedOn} />
            <TextField label="Amount promised (₹)" name="promisedAmount" inputMode="decimal" defaultValue={String(balance)} error={errors?.promisedAmount} />
          </>
        )}
      </FormGrid>
      <TextAreaField label="What was said" name="note" rows={3} required placeholder="For example: spoke to the accounts team, payment in the next cycle" error={errors?.note} />
      <FormActions>
        <SubmitButton label="Record follow-up" pendingLabel="Saving…" />
      </FormActions>
    </KeepValuesForm>
  );
}
