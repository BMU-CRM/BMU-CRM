'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { genderLabels } from '@/lib/employees/employeeRecordLabels';
import { savePersonalDetailsAction } from '@/server/actions/employeeActions';
import type { PersonalDetails } from '@/server/services/employeeService';

const genderOptions = Object.entries(genderLabels).map(([value, label]) => ({ value, label }));

type EmployeePersonalFormProps = {
  employeeId: string;
  details: PersonalDetails | null;
  // Date of birth and gender are changed by HR or a manager, not by the person.
  canEditFully: boolean;
  cancelHref: string;
};

export function EmployeePersonalForm({ employeeId, details, canEditFully, cancelHref }: EmployeePersonalFormProps) {
  const [result, formAction] = useActionState(savePersonalDetailsAction.bind(null, employeeId), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        {canEditFully && (
          <>
            <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={details?.date_of_birth ?? ''} error={errors?.dateOfBirth} />
            <SelectField label="Gender" name="gender" options={genderOptions} placeholder="Not set" defaultValue={details?.gender ?? ''} error={errors?.gender} />
          </>
        )}
        <TextField label="Personal email" name="personalEmail" type="email" defaultValue={details?.personal_email ?? ''} error={errors?.personalEmail} />
        <TextField label="Emergency contact name" name="emergencyContactName" defaultValue={details?.emergency_contact_name ?? ''} error={errors?.emergencyContactName} />
        <TextField
          label="Relationship"
          name="emergencyContactRelation"
          defaultValue={details?.emergency_contact_relation ?? ''}
          hint="Such as spouse, parent or sibling."
          error={errors?.emergencyContactRelation}
        />
        <TextField label="Emergency contact phone" name="emergencyContactPhone" type="tel" defaultValue={details?.emergency_contact_phone ?? ''} error={errors?.emergencyContactPhone} />
      </FormGrid>
      <TextAreaField label="Address" name="address" rows={3} defaultValue={details?.address ?? ''} error={errors?.address} />
      {!canEditFully && <p className={formStyles.hint}>Ask HR to change your date of birth or gender.</p>}
      <FormActions>
        <SubmitButton label="Save details" pendingLabel="Saving…" />
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
