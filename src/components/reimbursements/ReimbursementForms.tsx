'use client';

import { useActionState } from 'react';
import { AttachFileField } from '@/components/files/AttachFileField';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { payClaimAction, submitClaimAction } from '@/server/actions/reimbursementActions';

export function ClaimForm({ categories, files, today }: { categories: SelectOption[]; files: SelectOption[]; today: string }) {
  const [result, formAction] = useActionState(submitClaimAction, idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="What it was for" name="categoryId" options={categories} placeholder="Choose a category" required error={errors?.categoryId} />
        <TextField label="Amount (₹)" name="amount" inputMode="decimal" required error={errors?.amount} />
        <TextField label="Date spent" name="expenseDate" type="date" max={today} defaultValue={today} required error={errors?.expenseDate} />
      </FormGrid>
      <div className={layout.spaced}>
        <AttachFileField
          name="receiptFileId"
          label="Receipt or bill"
          files={files}
          hint="A photo or PDF of the bill. It is kept in your Files."
          error={errors?.receiptFileId}
        />
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Details" name="description" rows={3} required placeholder="For example: cab to the client meeting at Anna Nagar" error={errors?.description} />
      </div>
      <FormActions>
        <SubmitButton label="Submit claim" pendingLabel="Submitting…" />
        <ButtonLink href="/reimbursements" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function ClaimPaymentForm({ claimId, accounts, defaultAccountId, today }: { claimId: string; accounts: SelectOption[]; defaultAccountId: string; today: string }) {
  const [result, formAction] = useActionState(payClaimAction.bind(null, claimId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Paid on" name="paidOn" type="date" max={today} defaultValue={today} required error={errors?.paidOn} />
        <SelectField label="Paid by" name="method" options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))} defaultValue="bank_transfer" error={errors?.method} />
        <SelectField label="Paid from" name="accountId" options={accounts} defaultValue={defaultAccountId} required hint="The expense is filed against this account." error={errors?.accountId} />
        <TextField label="Reference" name="reference" hint="Such as the UTR." error={errors?.reference} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Mark as paid" pendingLabel="Saving…" />
        <ButtonLink href="/finance/salaries?view=reimbursements" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
