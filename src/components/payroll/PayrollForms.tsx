'use client';

import { useActionState, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import {
  formatPtSlabs,
  paymentMethodLabels,
  paymentMethods,
  payrollRuleLabels,
  type PayrollRuleKind,
  type PtSlab,
} from '@/lib/validation/payrollSchema';
import {
  addSalaryStructureAction,
  decidePayrollRunAction,
  markPayrollPaidAction,
  saveAppraisalAction,
  savePayrollLineAction,
  savePayrollRuleAction,
  savePayrollSettingsAction,
  saveSalaryComponentAction,
} from '@/server/actions/payrollActions';
import styles from './PayrollForms.module.css';

const amount = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

type LineValues = {
  incentive: number;
  bonus: number;
  overtime_amount: number;
  other_earnings: number;
  other_deductions: number;
  lop_adjustment: number;
  notes: string | null;
  overtime_hours: number;
};

export function PayrollLineForm({ runId, lineId, line }: { runId: string; lineId: string; line: LineValues }) {
  const [result, formAction] = useActionState(savePayrollLineAction.bind(null, runId, lineId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Incentive" name="incentive" inputMode="decimal" defaultValue={amount(line.incentive)} error={errors?.incentive} />
        <TextField label="Bonus" name="bonus" inputMode="decimal" defaultValue={amount(line.bonus)} error={errors?.bonus} />
        <TextField
          label="Overtime pay"
          name="overtimeAmount"
          inputMode="decimal"
          defaultValue={amount(line.overtime_amount)}
          hint={line.overtime_hours > 0 ? `${line.overtime_hours} overtime hours this month.` : 'Overtime hours appear here once HR sets an overtime rule.'}
          error={errors?.overtimeAmount}
        />
        <TextField label="Other earnings" name="otherEarnings" inputMode="decimal" defaultValue={amount(line.other_earnings)} error={errors?.otherEarnings} />
        <TextField
          label="Other deductions"
          name="otherDeductions"
          inputMode="decimal"
          defaultValue={amount(line.other_deductions)}
          hint="Such as an advance being repaid."
          error={errors?.otherDeductions}
        />
        <TextField
          label="Change loss of pay (days)"
          name="lopAdjustment"
          type="number"
          step="0.5"
          min={-31}
          max={31}
          defaultValue={line.lop_adjustment}
          hint="Negative to pay days back, positive to deduct more."
          error={errors?.lopAdjustment}
        />
      </FormGrid>
      <TextAreaField label="Note" name="notes" rows={2} defaultValue={line.notes ?? ''} hint="Shown on the payslip." error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save and recalculate" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/payroll/${runId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function PayrollDecisionForm({ runId }: { runId: string }) {
  const [result, formAction] = useActionState(decidePayrollRunAction.bind(null, runId), idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <fieldset className={formStyles.field}>
        <legend className={formStyles.label}>Decision</legend>
        <label className={styles.choice}>
          <input type="radio" name="decision" value="approve" defaultChecked /> Approve this payroll
        </label>
        <label className={styles.choice}>
          <input type="radio" name="decision" value="send_back" /> Send it back to HR to change
        </label>
      </fieldset>
      <TextAreaField label="Note" name="note" rows={3} hint="Needed when sending it back. HR sees it." error={result.fieldErrors?.note} />
      <FormActions>
        <SubmitButton label="Save decision" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/payroll/${runId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function MarkPayrollPaidForm({ runId, today, accounts, defaultAccountId }: { runId: string; today: string; accounts: SelectOption[]; defaultAccountId: string }) {
  const [result, formAction] = useActionState(markPayrollPaidAction.bind(null, runId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Paid from" name="accountId" options={accounts} defaultValue={defaultAccountId} required hint="Filed as a salary expense against this account." error={errors?.accountId} />
        <TextField label="Paid on" name="paidOn" type="date" max={today} defaultValue={today} required error={errors?.paidOn} />
        <SelectField
          label="Paid by"
          name="method"
          options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))}
          defaultValue="bank_transfer"
          error={errors?.method}
        />
        <TextField label="Transaction reference" name="reference" hint="Such as the bank batch or UTR number." error={errors?.reference} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Mark as paid" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/payroll/${runId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type StructureDefaults = {
  basic: number;
  hra: number;
  other_allowances: number;
  special_allowance: number;
  incentive: number;
  bonus: number;
  pf_applies: boolean;
  esi_applies: boolean;
  pt_state: string | null;
  tds_monthly: number | null;
};

export function SalaryStructureForm({ employeeId, previous, defaultDate }: { employeeId: string; previous: StructureDefaults | null; defaultDate: string }) {
  const [result, formAction] = useActionState(addSalaryStructureAction.bind(null, employeeId), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Effective from" name="effectiveFrom" type="date" defaultValue={defaultDate} required error={errors?.effectiveFrom} />
        <TextField label="Basic (monthly)" name="basic" inputMode="decimal" defaultValue={amount(previous?.basic)} required error={errors?.basic} />
        <TextField label="HRA" name="hra" inputMode="decimal" defaultValue={amount(previous?.hra)} error={errors?.hra} />
        <TextField label="Other allowances" name="otherAllowances" inputMode="decimal" defaultValue={amount(previous?.other_allowances)} error={errors?.otherAllowances} />
        <TextField label="Special allowance" name="specialAllowance" inputMode="decimal" defaultValue={amount(previous?.special_allowance)} error={errors?.specialAllowance} />
        <TextField label="Incentive" name="incentive" inputMode="decimal" defaultValue={amount(previous?.incentive)} hint="Each month's run starts with this; HR can change it per month." error={errors?.incentive} />
        <TextField label="Bonus" name="bonus" inputMode="decimal" defaultValue={amount(previous?.bonus)} error={errors?.bonus} />
        <TextField label="Professional tax state" name="ptState" defaultValue={previous?.pt_state ?? ''} hint="Empty uses the company's state from HR settings." error={errors?.ptState} />
        <TextField
          label="Fixed monthly TDS"
          name="tdsMonthly"
          inputMode="decimal"
          defaultValue={amount(previous?.tds_monthly)}
          hint="Empty works it out from the TDS rule."
          error={errors?.tdsMonthly}
        />
      </FormGrid>
      <div className={styles.checks}>
        <label className={styles.choice}>
          <input type="checkbox" name="pfApplies" defaultChecked={previous?.pf_applies ?? true} /> PF applies
        </label>
        <label className={styles.choice}>
          <input type="checkbox" name="esiApplies" defaultChecked={previous?.esi_applies ?? true} /> ESI applies (when within the ESI wage limit)
        </label>
      </div>
      {previous && <TextAreaField label="Reason for the change" name="revisionReason" rows={2} hint="Such as the annual increment." error={errors?.revisionReason} />}
      <FormActions>
        <SubmitButton label="Save salary structure" pendingLabel="Saving…" />
        <ButtonLink href={`/hr/payroll/structures/${employeeId}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Appraisal = { id: string; employee_id: string; period_label: string; period_start: string; period_end: string; rating: number; notes: string | null };

const ratingOptions = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map((value) => ({ value, label: `${value} of 5` }));

export function AppraisalForm({ appraisal, employees, employeeId }: { appraisal?: Appraisal; employees: SelectOption[]; employeeId?: string }) {
  const [result, formAction] = useActionState(saveAppraisalAction.bind(null, appraisal?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Employee" name="employeeId" options={employees} placeholder="Choose someone" defaultValue={appraisal?.employee_id ?? employeeId} required error={errors?.employeeId} />
        <TextField label="Period" name="periodLabel" placeholder="2026, or H1 2026" defaultValue={appraisal?.period_label} required error={errors?.periodLabel} />
        <TextField label="From" name="periodStart" type="date" defaultValue={appraisal?.period_start} required error={errors?.periodStart} />
        <TextField label="To" name="periodEnd" type="date" defaultValue={appraisal?.period_end} required error={errors?.periodEnd} />
        <SelectField label="Rating" name="rating" options={ratingOptions} defaultValue={appraisal ? String(appraisal.rating) : '3'} error={errors?.rating} />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={4} defaultValue={appraisal?.notes ?? ''} hint="The person can see these." error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save appraisal" pendingLabel="Saving…" />
        <ButtonLink href="/hr/payroll/appraisals" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Component = {
  id: string;
  name: string;
  kind: string;
  calculation: string;
  amount: number | null;
  percentage: number | null;
  percentage_of: string | null;
  is_taxable: boolean;
  is_active: boolean;
};

export function SalaryComponentForm({ component }: { component?: Component }) {
  const [result, formAction] = useActionState(saveSalaryComponentAction.bind(null, component?.id ?? null), idleResult);
  const [calculation, setCalculation] = useState(component?.calculation ?? 'fixed');
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" defaultValue={component?.name} required error={errors?.name} />
        <SelectField
          label="Type"
          name="kind"
          options={[
            { value: 'earning', label: 'Earning' },
            { value: 'deduction', label: 'Deduction' },
          ]}
          defaultValue={component?.kind ?? 'earning'}
          error={errors?.kind}
        />
        <SelectField
          label="Worked out as"
          name="calculation"
          options={[
            { value: 'fixed', label: 'A fixed monthly amount' },
            { value: 'percentage', label: 'A percentage' },
          ]}
          value={calculation}
          onChange={(event) => setCalculation(event.target.value)}
          error={errors?.calculation}
        />
        {calculation === 'fixed' ? (
          <TextField label="Monthly amount" name="amount" inputMode="decimal" defaultValue={amount(component?.amount)} hint="Earnings are reduced for loss of pay days." error={errors?.amount} />
        ) : (
          <>
            <TextField label="Percentage" name="percentage" inputMode="decimal" defaultValue={amount(component?.percentage)} error={errors?.percentage} />
            <SelectField
              label="Of"
              name="percentageOf"
              options={[
                { value: 'basic', label: 'Basic pay' },
                { value: 'gross', label: 'Fixed gross pay' },
              ]}
              defaultValue={component?.percentage_of ?? 'basic'}
              error={errors?.percentageOf}
            />
          </>
        )}
      </FormGrid>
      <div className={styles.checks}>
        <label className={styles.choice}>
          <input type="checkbox" name="isTaxable" defaultChecked={component?.is_taxable ?? true} /> Taxable (counts for TDS)
        </label>
        {component && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={component.is_active} /> In use
          </label>
        )}
      </div>
      <FormActions>
        <SubmitButton label="Save component" pendingLabel="Saving…" />
        <ButtonLink href="/settings/hr/payroll" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Rule = {
  id: string;
  kind: PayrollRuleKind;
  effective_from: string;
  state: string | null;
  employee_rate: number | null;
  employer_rate: number | null;
  wage_limit: number | null;
  slabs: PtSlab[] | null;
  notes: string | null;
};

const ruleHelp: Record<PayrollRuleKind, { employeeRate: string; employerRate?: string; wageLimit?: string }> = {
  pf: { employeeRate: "Employee's share, % of basic", employerRate: "Employer's share, % of basic", wageLimit: 'Monthly wage limit (basic counted up to this). Empty means no limit.' },
  esi: { employeeRate: "Employee's share, % of gross", employerRate: "Employer's share, % of gross", wageLimit: 'Applies when monthly gross is at or below this. Empty means everyone.' },
  tds: { employeeRate: 'TDS rate, % of yearly taxable pay above the threshold', wageLimit: 'Yearly taxable pay free of TDS' },
  pt: { employeeRate: '' },
};

export function PayrollRuleForm({ kind, rule, today }: { kind: PayrollRuleKind; rule?: Rule; today: string }) {
  const [result, formAction] = useActionState(savePayrollRuleAction.bind(null, rule?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const help = ruleHelp[kind];
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <input type="hidden" name="kind" value={kind} />
      <p className={formStyles.hint}>{payrollRuleLabels[kind]}. A rule applies to payroll months from its date until a newer rule starts.</p>
      <FormGrid>
        <TextField label="Effective from" name="effectiveFrom" type="date" defaultValue={rule?.effective_from ?? today} required error={errors?.effectiveFrom} />
        {kind === 'pt' ? (
          <TextField label="State" name="state" defaultValue={rule?.state ?? ''} required error={errors?.state} />
        ) : (
          <>
            <TextField label={help.employeeRate} name="employeeRate" inputMode="decimal" defaultValue={amount(rule?.employee_rate)} required error={errors?.employeeRate} />
            {help.employerRate && (
              <TextField label={help.employerRate} name="employerRate" inputMode="decimal" defaultValue={amount(rule?.employer_rate)} required error={errors?.employerRate} />
            )}
            <TextField label={help.wageLimit ?? 'Limit'} name="wageLimit" inputMode="decimal" defaultValue={amount(rule?.wage_limit)} error={errors?.wageLimit} />
          </>
        )}
      </FormGrid>
      {kind === 'pt' && (
        <TextAreaField
          label="Monthly slabs on gross pay"
          name="slabs"
          rows={5}
          defaultValue={formatPtSlabs(rule?.slabs)}
          placeholder={'0 - 21000 = 0\n21001 - = 208'}
          hint='One per line: "from - to = tax". Leave the top of the last slab empty.'
          error={errors?.slabs}
        />
      )}
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={rule?.notes ?? ''} hint="Such as the notification this comes from." error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save rule" pendingLabel="Saving…" />
        <ButtonLink href="/settings/hr/payroll" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function PayrollSettingsForm({ settings }: { settings: { default_pt_state: string | null; payroll_absence_lop: boolean } }) {
  const [result, formAction] = useActionState(savePayrollSettingsAction, idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField
          label="Professional tax state"
          name="defaultPtState"
          defaultValue={settings.default_pt_state ?? ''}
          hint="Used for everyone whose salary structure names no state."
          error={result.fieldErrors?.defaultPtState}
        />
      </FormGrid>
      <label className={styles.choice}>
        <input type="checkbox" name="absenceLop" defaultChecked={settings.payroll_absence_lop} /> Working days without attendance or leave are loss of pay
      </label>
      <p className={formStyles.hint}>Turn this off until attendance is recorded for everyone, or every unrecorded day reduces pay.</p>
      <FormActions>
        <SubmitButton label="Save payroll settings" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
