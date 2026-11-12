'use client';

import { useActionState, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { exitCategoryLabels, settlementTotal } from '@/lib/validation/exitSchema';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import {
  decideResignationAction,
  markSettlementPaidAction,
  saveExitChecklistItemAction,
  saveExitInterviewAction,
  saveNoticePeriodAction,
  saveSettlementAction,
  submitResignationAction,
} from '@/server/actions/exitActions';
import styles from './ExitForms.module.css';

export function ResignationForm({ today, noticeDays }: { today: string; noticeDays: number | null }) {
  const [result, formAction] = useActionState(submitResignationAction, idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction} key={result.status === 'success' ? 'sent' : 'form'}>
      <FormMessage result={result} />
      <TextAreaField label="Reason" name="reason" rows={5} required hint="HR and your manager see this." error={errors?.reason} />
      <FormGrid>
        <TextField
          label="Last day you propose"
          name="proposedLastDay"
          type="date"
          min={today}
          hint={noticeDays !== null ? `The notice period is ${noticeDays} days. HR confirms the last day.` : 'HR confirms the last day.'}
          error={errors?.proposedLastDay}
        />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Submit resignation" pendingLabel="Sending…" variant="danger" />
      </FormActions>
    </KeepValuesForm>
  );
}

export function ResignationDecisionForm({ resignationId, suggestedLastDay }: { resignationId: string; suggestedLastDay: string | null }) {
  const [result, formAction] = useActionState(decideResignationAction.bind(null, resignationId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <fieldset className={formStyles.field}>
        <legend className={formStyles.label}>Decision</legend>
        <label className={styles.choice}>
          <input type="radio" name="decision" value="approve" defaultChecked /> Accept the resignation
        </label>
        <label className={styles.choice}>
          <input type="radio" name="decision" value="reject" /> Reject it
        </label>
      </fieldset>
      <FormGrid>
        <TextField
          label="Last working day"
          name="lastWorkingDay"
          type="date"
          defaultValue={suggestedLastDay ?? ''}
          hint="Worked out from the notice period when one is set. Change it if you agree a different day."
          error={errors?.lastWorkingDay}
        />
      </FormGrid>
      <TextAreaField label="Note to the person" name="note" rows={3} hint="Needed when rejecting." error={errors?.note} />
      <FormActions>
        <SubmitButton label="Save decision" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/exits/${resignationId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function ExitInterviewForm({ resignationId, interviewAt, notes }: { resignationId: string; interviewAt: string | null; notes: string | null }) {
  const [result, formAction] = useActionState(saveExitInterviewAction.bind(null, resignationId), idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="When" name="interviewAt" type="datetime-local" defaultValue={interviewAt ?? ''} error={result.fieldErrors?.interviewAt} />
      </FormGrid>
      <TextAreaField label="Feedback" name="notes" rows={4} defaultValue={notes ?? ''} hint="Why they are leaving and what could be better. Only HR sees this." error={result.fieldErrors?.notes} />
      <FormActions>
        <SubmitButton label="Save exit interview" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}

type SettlementValues = {
  pending_salary: number;
  leave_encashment_days: number;
  leave_encashment_amount: number;
  reimbursements_due: number;
  other_earnings: number;
  notice_recovery: number;
  other_deductions: number;
  notes: string | null;
};

const fields: { key: keyof Omit<SettlementValues, 'notes' | 'leave_encashment_days'>; name: string; label: string; sign: 1 | -1 }[] = [
  { key: 'pending_salary', name: 'pendingSalary', label: 'Pending salary', sign: 1 },
  { key: 'leave_encashment_amount', name: 'leaveEncashmentAmount', label: 'Leave encashment', sign: 1 },
  { key: 'reimbursements_due', name: 'reimbursementsDue', label: 'Reimbursements due', sign: 1 },
  { key: 'other_earnings', name: 'otherEarnings', label: 'Other amounts owed', sign: 1 },
  { key: 'notice_recovery', name: 'noticeRecovery', label: 'Notice period recovery', sign: -1 },
  { key: 'other_deductions', name: 'otherDeductions', label: 'Other deductions', sign: -1 },
];

// Starts from the saved figures, or the suggestion when nothing is saved yet. The total
// updates as you type; the saved total is always worked out by the database.
export function SettlementForm({ resignationId, values }: { resignationId: string; values: SettlementValues }) {
  const [result, formAction] = useActionState(saveSettlementAction.bind(null, resignationId), idleResult);
  const [amounts, setAmounts] = useState(values);
  const errors = result.fieldErrors;
  const total = settlementTotal(amounts);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        {fields.map((field) => (
          <TextField
            key={field.key}
            label={field.sign < 0 ? `${field.label} (taken off)` : field.label}
            name={field.name}
            inputMode="decimal"
            defaultValue={String(values[field.key])}
            onChange={(event) => setAmounts((current) => ({ ...current, [field.key]: Number(event.target.value) || 0 }))}
            error={errors?.[field.name]}
          />
        ))}
        <TextField
          label="Leave days encashed"
          name="leaveEncashmentDays"
          type="number"
          step="0.5"
          min={0}
          defaultValue={String(values.leave_encashment_days)}
          error={errors?.leaveEncashmentDays}
        />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={3} defaultValue={values.notes ?? ''} hint="Shown on the settlement statement." error={errors?.notes} />
      <p className={styles.total} aria-live="polite">
        Final amount <strong>{formatRupees(total)}</strong>
      </p>
      <FormActions>
        <SubmitButton label="Save settlement" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/exits/${resignationId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function SettlementPaymentForm({ resignationId, today, accounts, defaultAccountId }: { resignationId: string; today: string; accounts: { value: string; label: string }[]; defaultAccountId: string }) {
  const [result, formAction] = useActionState(markSettlementPaidAction.bind(null, resignationId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Paid from" name="accountId" options={accounts} defaultValue={defaultAccountId} required hint="Filed as an expense against this account." error={errors?.accountId} />
        <TextField label="Paid on" name="paidOn" type="date" max={today} defaultValue={today} required error={errors?.paidOn} />
        <SelectField
          label="Paid by"
          name="method"
          options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))}
          defaultValue="bank_transfer"
          error={errors?.method}
        />
        <TextField label="Transaction reference" name="reference" error={errors?.reference} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Mark as paid" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/exits/${resignationId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function ExitChecklistItemForm({ item }: { item?: { id: string; name: string; category: string; is_active: boolean } }) {
  const [result, formAction] = useActionState(saveExitChecklistItemAction.bind(null, item?.id ?? null), idleResult);
  const prefix = `exit-item-${item?.id ?? 'new'}`;
  return (
    <KeepValuesForm action={formAction} key={!item && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <TextField label="Item" name="name" id={`${prefix}-name`} defaultValue={item?.name} required error={result.fieldErrors?.name} />
        <SelectField
          label="Kind"
          name="category"
          id={`${prefix}-category`}
          options={Object.entries(exitCategoryLabels).map(([value, label]) => ({ value, label }))}
          defaultValue={item?.category ?? 'other'}
        />
        {item && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={item.is_active} /> In use
          </label>
        )}
        <SubmitButton label={item ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}

export function NoticePeriodForm({ days }: { days: number | null }) {
  const [result, formAction] = useActionState(saveNoticePeriodAction, idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField
          label="Notice period (days)"
          name="noticePeriodDays"
          type="number"
          min={0}
          max={180}
          defaultValue={days ?? ''}
          hint="Empty means not set: HR then chooses each last working day."
          error={result.fieldErrors?.noticePeriodDays}
        />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Save notice period" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
