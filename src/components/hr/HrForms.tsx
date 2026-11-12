'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { dayStatusLabels, dayStatusOverrides } from '@/lib/attendance/summariseAttendance';
import { holidayKindLabels, holidayKinds, workModeLabels } from '@/lib/validation/hrSchema';
import {
  correctAttendanceAction,
  deleteLeaveTypeAction,
  importAttendanceAction,
  saveEmploymentTypeAction,
  saveHolidayAction,
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

type WorkingHours = {
  work_start: string;
  work_end: string;
  late_grace_minutes: number;
  working_days: number[];
  overtime_after_minutes: number | null;
  half_day_minutes: number | null;
  default_probation_months: number | null;
};

const asHours = (minutes: number | null) => (minutes === null ? '' : String(minutes / 60));

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
        <TextField
          label="Overtime after (hours)"
          name="overtimeAfterHours"
          type="number"
          min={1}
          max={24}
          step="0.5"
          defaultValue={asHours(settings.overtime_after_minutes)}
          hint="Hours worked in a day, less breaks. Empty means overtime is not counted."
          error={errors?.overtimeAfterHours}
        />
        <TextField
          label="Half day under (hours)"
          name="halfDayHours"
          type="number"
          min={0.5}
          max={24}
          step="0.5"
          defaultValue={asHours(settings.half_day_minutes)}
          hint="A day with fewer hours worked counts as a half day. Empty means never."
          error={errors?.halfDayHours}
        />
        <TextField
          label="Default probation (months)"
          name="defaultProbationMonths"
          type="number"
          min={0}
          max={24}
          defaultValue={settings.default_probation_months ?? ''}
          hint="Offered when editing someone with no probation set."
          error={errors?.defaultProbationMonths}
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
  carry_forward_cap: number | null;
  carry_forward_expiry_months: number | null;
  is_encashable: boolean;
};

export function LeaveTypeForm({ leaveType }: { leaveType?: LeaveType }) {
  const [result, formAction] = useActionState(saveLeaveTypeAction.bind(null, leaveType?.id ?? null), idleResult);
  const prefix = leaveType?.id ?? 'new';

  return (
    <KeepValuesForm action={formAction} key={!leaveType && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      {/* Four fields of equal width, aligned at the top; the choices and buttons below. */}
      <div className={styles.leaveFields}>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={leaveType?.name} required error={result.fieldErrors?.name} />
        <TextField
          label="Days per year"
          name="yearlyAllowance"
          id={`${prefix}-allowance`}
          type="number"
          min={0}
          step="0.5"
          defaultValue={leaveType?.yearly_allowance ?? ''}
          hint="Empty: no limit."
          error={result.fieldErrors?.yearlyAllowance}
        />
        <TextField
          label="Carry forward up to (days)"
          name="carryForwardCap"
          id={`${prefix}-carry`}
          type="number"
          min={0.5}
          step="0.5"
          defaultValue={leaveType?.carry_forward_cap ?? ''}
          hint="Empty: none carried."
          error={result.fieldErrors?.carryForwardCap}
        />
        <TextField
          label="Carried days last (months)"
          name="carryForwardExpiryMonths"
          id={`${prefix}-expiry`}
          type="number"
          min={1}
          max={12}
          defaultValue={leaveType?.carry_forward_expiry_months ?? ''}
          hint="Empty: all year."
          error={result.fieldErrors?.carryForwardExpiryMonths}
        />
      </div>
      <div className={styles.leaveOptions}>
        <label className={styles.check}>
          <input type="checkbox" name="isPaid" defaultChecked={leaveType?.is_paid ?? true} /> Paid
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="requiresAttachment" defaultChecked={leaveType?.requires_attachment ?? false} /> Needs a document
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="isEncashable" defaultChecked={leaveType?.is_encashable ?? false} /> Can be encashed
        </label>
        {leaveType && (
          <label className={styles.check}>
            <input type="checkbox" name="isActive" defaultChecked={leaveType.is_active} /> Available
          </label>
        )}
        <span className={styles.leaveButtons}>
          <SubmitButton label={leaveType ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
          {leaveType && (
            <ConfirmActionButton
              label="Delete"
              title={`Delete ${leaveType.name}?`}
              description="Only a leave type nobody has used can be deleted. To stop new requests for a used one, untick Available instead."
              confirmLabel="Delete leave type"
              variant="danger"
              action={deleteLeaveTypeAction.bind(null, leaveType.id)}
            />
          )}
        </span>
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
        <SelectField
          label="Worked from"
          name="workMode"
          id="correct-mode"
          options={Object.entries(workModeLabels).map(([value, label]) => ({ value, label }))}
          defaultValue="office"
          error={errors?.workMode}
        />
        <SelectField
          label="Day status"
          name="statusOverride"
          id="correct-status"
          options={dayStatusOverrides.map((status) => ({ value: status, label: dayStatusLabels[status] }))}
          placeholder="Work it out from the times"
          hint="Set this for a half day, or to mark a day absent or as leave."
          error={errors?.statusOverride}
        />
        <TextField label="Reason for the correction" name="note" id="correct-note" error={errors?.note} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Save correction" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}

type EmploymentType = { id: string; name: string; is_active: boolean };

export function EmploymentTypeForm({ employmentType }: { employmentType?: EmploymentType }) {
  const [result, formAction] = useActionState(saveEmploymentTypeAction.bind(null, employmentType?.id ?? null), idleResult);
  const prefix = `employment-${employmentType?.id ?? 'new'}`;

  return (
    <KeepValuesForm action={formAction} key={!employmentType && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={employmentType?.name} required error={result.fieldErrors?.name} />
        {employmentType && (
          <label className={styles.check}>
            <input type="checkbox" name="isActive" defaultChecked={employmentType.is_active} /> Available
          </label>
        )}
        <SubmitButton label={employmentType ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}

type Holiday = { id: string; holiday_date: string; name: string; kind: string; description: string | null };

export function HolidayForm({ holiday, defaultDate }: { holiday?: Holiday; defaultDate?: string }) {
  const [result, formAction] = useActionState(saveHolidayAction.bind(null, holiday?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const backMonth = (holiday?.holiday_date ?? defaultDate ?? '').slice(0, 7);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Date" name="holidayDate" type="date" defaultValue={holiday?.holiday_date ?? defaultDate} required error={errors?.holidayDate} />
        <TextField label="Name" name="name" defaultValue={holiday?.name} required error={errors?.name} />
        <SelectField
          label="Type"
          name="kind"
          options={holidayKinds.map((kind) => ({ value: kind, label: holidayKindLabels[kind] }))}
          defaultValue={holiday?.kind ?? 'public'}
          error={errors?.kind}
        />
      </FormGrid>
      <TextAreaField label="Description" name="description" rows={3} defaultValue={holiday?.description ?? ''} hint="Optional. Shown on the calendar." error={errors?.description} />
      <FormActions>
        <SubmitButton label={holiday ? 'Save holiday' : 'Add holiday'} pendingLabel="Saving…" />
        <ButtonLink href={backMonth ? `/hr/holidays?month=${backMonth}` : '/hr/holidays'} variant="ghost">
          Cancel
        </ButtonLink>
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
