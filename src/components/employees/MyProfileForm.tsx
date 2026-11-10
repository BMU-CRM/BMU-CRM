'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { updateMyProfileAction } from '@/server/actions/employeeActions';

export function MyProfileForm({ phone, skills }: { phone: string | null; skills: string[] }) {
  const [result, formAction] = useActionState(updateMyProfileAction, idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Phone" name="phone" type="tel" defaultValue={phone ?? ''} error={result.fieldErrors?.phone} />
        <TextField label="Skills" name="skills" defaultValue={skills.join(', ')} hint="Separate skills with commas." error={result.fieldErrors?.skills} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Save changes" pendingLabel="Saving…" />
        <ButtonLink href="/set-password" variant="ghost">
          Change password
        </ButtonLink>
        <ButtonLink href="/profile/notifications" variant="ghost">
          Notification settings
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
