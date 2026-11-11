'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { maskAadhaar, maskAccount } from '@/lib/employees/employeeRecordLabels';
import { savePrivateDetailsAction } from '@/server/actions/employeeActions';
import type { PrivateDetails } from '@/server/services/employeeService';

type EmployeePrivateFormProps = {
  employeeId: string;
  details: PrivateDetails | null;
  encryptionReady: boolean;
};

// Saved Aadhaar and account numbers are never sent to the browser, so their boxes start
// empty. Leaving one empty keeps the saved number.
export function EmployeePrivateForm({ employeeId, details, encryptionReady }: EmployeePrivateFormProps) {
  const [result, formAction] = useActionState(savePrivateDetailsAction.bind(null, employeeId), idleResult);
  const errors = result.fieldErrors;
  const savedAadhaar = maskAadhaar(details?.aadhaar_last4 ?? null);
  const savedAccount = maskAccount(details?.account_last4 ?? null);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      {!encryptionReady && (
        <p className={formStyles.hint}>
          Encryption is not set up, so Aadhaar and account numbers cannot be saved yet. PAN and bank details can.
        </p>
      )}
      <FormGrid>
        <TextField
          label="Aadhaar number"
          name="aadhaar"
          inputMode="numeric"
          autoComplete="off"
          placeholder={savedAadhaar ?? '1234 5678 9012'}
          disabled={!encryptionReady}
          hint={savedAadhaar ? 'Leave empty to keep the saved number.' : '12 digits.'}
          error={errors?.aadhaar}
        />
        <TextField label="PAN" name="pan" autoComplete="off" defaultValue={details?.pan ?? ''} placeholder="ABCDE1234F" error={errors?.pan} />
        <TextField label="Bank name" name="bankName" defaultValue={details?.bank_name ?? ''} error={errors?.bankName} />
        <TextField
          label="Account number"
          name="accountNumber"
          inputMode="numeric"
          autoComplete="off"
          placeholder={savedAccount ?? ''}
          disabled={!encryptionReady}
          hint={savedAccount ? 'Leave empty to keep the saved number.' : '6 to 18 digits.'}
          error={errors?.accountNumber}
        />
        <TextField label="IFSC" name="ifsc" autoComplete="off" defaultValue={details?.ifsc ?? ''} placeholder="HDFC0001234" error={errors?.ifsc} />
        <TextField label="Account holder" name="accountHolder" defaultValue={details?.account_holder ?? ''} error={errors?.accountHolder} />
      </FormGrid>
      {(savedAadhaar || savedAccount) && (
        <fieldset className={formStyles.field}>
          <legend className={formStyles.label}>Remove a saved number</legend>
          {savedAadhaar && (
            <div>
              <label>
                <input type="checkbox" name="clearAadhaar" /> Remove the Aadhaar number
              </label>
            </div>
          )}
          {savedAccount && (
            <div>
              <label>
                <input type="checkbox" name="clearAccountNumber" /> Remove the account number
              </label>
            </div>
          )}
        </fieldset>
      )}
      <FormActions>
        <SubmitButton label="Save details" pendingLabel="Saving…" />
        <ButtonLink href={`/people/employees/${employeeId}?tab=private`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
