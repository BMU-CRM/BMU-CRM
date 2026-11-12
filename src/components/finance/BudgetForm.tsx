'use client';

import { useActionState, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { budgetKindLabels, budgetKinds } from '@/lib/validation/budgetSchema';
import { saveBudgetAction } from '@/server/actions/budgetActions';

type BudgetValues = { id: string; department_id: string; period_kind: string; period_start: string; amount: number; notes: string | null };

type BudgetFormProps = {
  budget?: BudgetValues;
  departments: SelectOption[];
  // Financial years to offer, by the year they start.
  years: number[];
  defaultMonth: string;
  defaultYear: number;
};

export function BudgetForm({ budget, departments, years, defaultMonth, defaultYear }: BudgetFormProps) {
  const [result, formAction] = useActionState(saveBudgetAction.bind(null, budget?.id ?? null), idleResult);
  const [kind, setKind] = useState(budget?.period_kind ?? 'month');
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Department" name="departmentId" options={departments} placeholder="Choose a department" defaultValue={budget?.department_id} required error={errors?.departmentId} />
        <SelectField
          label="Budget for a"
          name="periodKind"
          options={budgetKinds.map((value) => ({ value, label: budgetKindLabels[value] }))}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          error={errors?.periodKind}
        />
        {kind === 'month' ? (
          <TextField label="Month" name="month" type="month" defaultValue={budget?.period_kind === 'month' ? budget.period_start.slice(0, 7) : defaultMonth} required error={errors?.month} />
        ) : (
          <SelectField
            label="Financial year"
            name="yearStart"
            options={years.map((year) => ({ value: String(year), label: `April ${year} to March ${year + 1}` }))}
            defaultValue={budget?.period_kind === 'year' ? budget.period_start.slice(0, 4) : String(defaultYear)}
            error={errors?.yearStart}
          />
        )}
        <TextField
          label="Budget (₹)"
          name="amount"
          inputMode="decimal"
          defaultValue={budget ? String(budget.amount) : ''}
          required
          hint="Finance and the department head are told at 80% and when it is used up."
          error={errors?.amount}
        />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={budget?.notes ?? ''} error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save budget" pendingLabel="Saving…" />
        <ButtonLink href="/finance/budgets" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
