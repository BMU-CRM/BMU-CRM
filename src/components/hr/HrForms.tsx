'use client';

import { useActionState } from 'react';
import { FormActions, FormGrid, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SelectField } from '@/components/ui/FormFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import {
  correctAttendanceAction,
  importAttendanceAction,
  saveLeaveTypeAction,
  saveWorkingHoursAction,
} from '@/server/actions/hrActions';
import styles from './HrForms.module.css';

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

type WorkingHours = { work_start: string; work_end: string; late_grace_minutes: number; working_days: number[] };

export function WorkingHoursForm({ settings }: { settings: WorkingHours }) {
  const [result, formAction] = useActionState(saveWorkingHoursAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Day starts" name="workStart" type="time" defaultValue={settings.work_start.slice(0, 5)} required error={errors?.workStart} />
        <TextField label="Day ends" name="workEnd" type="time" defaultValue={settings.work_end.slice(0, 5)} required error={errors?.workEnd} />
        <TextField
          label="Late after (minutes)"
          name="lateGraceMinutes"
          type="number"
          min={0}
          max={240}
          defaultValue={settings.late_grace_minutes}
          hint="Grace period after the start time."
          error={errors?.lateGraceMinutes}
        />
      </FormGrid>
      <fieldset className={styles.days}>
        <legend className={formStyles.label}>Working days</legend>
        {weekdays.map((day) => (
          <label key={day.value} className={styles.day}>
            <input type="checkbox" name="workingDays" value={day.value} defaultChecked={settings.working_days.includes(day.value)} />
            {day.label}
          </label>
        ))}
      </fieldset>
      {errors?.workingDays && <p className={formStyles.error}>{errors.workingDays}</p>}
      <FormActions>
        <SubmitButton label="Save working hours" pendingLabel="Saving…" />
      </FormActions>
    </KeepValuesForm>
  );
}

type LeaveType = {
  id: string;
  name: string;
  yearly_allowance: number | null;
  is_paid: boolean;
  requires_attachment: boolean;
  is_active: boolean;
};

export function LeaveTypeForm({ leaveType }: { leaveType?: LeaveType }) {
  const [result, formAction] = useActionState(saveLeaveTypeAction.bind(null, leaveType?.id ?? null), idleResult);
  const prefix = leaveType?.id ?? 'new';

  return (
    <KeepValuesForm action={formAction} key={!leaveType && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={leaveType?.name} required error={result.fieldErrors?.name} />
        <TextField
          label="Days per year"
          name="yearlyAllowance"
          id={`${prefix}-allowance`}
          type="number"
          min={0}
          step="0.5"
          defaultValue={leaveType?.yearly_allowance ?? ''}
          hint="Empty means no limit."
          error={result.fieldErrors?.yearlyAllowance}
        />
        <label className={styles.check}>
          <input type="checkbox" name="isPaid" defaultChecked={leaveType?.is_paid ?? true} /> Paid
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="requiresAttachment" defaultChecked={leaveType?.requires_attachment ?? false} /> Needs a document
        </label>
        {leaveType && (
          <label className={styles.check}>
            <input type="checkbox" name="isActive" defaultChecked={leaveType.is_active} /> Available
          </label>
        )}
        <SubmitButton label={leaveType ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}

export function AttendanceCorrectionForm({ employees }: { employees: SelectOption[] }) {
  const [result, formAction] = useActionState(correctAttendanceAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Employee" name="employeeId" id="correct-employee" options={employees} placeholder="Choose someone" required error={errors?.employeeId} />
        <TextField label="Date" name="workDate" id="correct-date" type="date" required error={errors?.workDate} />
        <TextField label="Checked in" name="checkIn" id="correct-in" type="time" error={errors?.checkIn} />
        <TextField label="Checked out" name="checkOut" id="correct-out" type="time" error={errors?.checkOut} />
        <TextField label="Reason for the correction" name="note" id="correct-note" error={errors?.note} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Save correction" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}

export function AttendanceImportForm() {
  const [result, formAction] = useActionState(importAttendanceAction, idleResult);

  return (
    <form action={formAction}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <div className={formStyles.field}>
          <label htmlFor="attendance-file" className={formStyles.label}>
            CSV file
          </label>
          <input id="attendance-file" name="file" type="file" accept=".csv,text/csv" required className={formStyles.control} />
          <p className={formStyles.hint}>Columns: employee (email or ID), date, check_in, check_out. Times like 09:30.</p>
        </div>
        <SubmitButton label="Import" pendingLabel="Importing…" variant="secondary" />
      </div>
    </form>
  );
}
