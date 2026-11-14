'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { updateEmployeeAction } from '@/server/actions/employeeActions';

const employmentStatusOptions: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'notice_period', label: 'Notice period' },
  { value: 'exited', label: 'Exited' },
];

type EmployeeEditFormProps = {
  employee: {
    id: string;
    full_name: string;
    work_email: string;
    phone: string | null;
    skills: string[];
    joining_date: string | null;
    employment_status: string;
    role_id: string;
    designation_id: string | null;
    department_id: string | null;
    reporting_manager_id: string | null;
    employment_type_id: string | null;
    probation_months: number | null;
    confirmation_date: string | null;
  };
  employmentTypes: SelectOption[];
  // The company default from HR settings, offered when the person has none yet.
  defaultProbationMonths: number | null;
  roles: SelectOption[];
  designations: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  canTransfer: boolean;
  canChangeRole: boolean;
  canChangeEmail: boolean;
  // Roles the person can switch to besides their main one.
  extraRoleIds: string[];
};

export function EmployeeEditForm({
  employee,
  employmentTypes,
  defaultProbationMonths,
  roles,
  designations,
  departments,
  managers,
  canTransfer,
  canChangeRole,
  canChangeEmail,
  extraRoleIds,
}: EmployeeEditFormProps) {
  const [result, formAction] = useActionState(updateEmployeeAction.bind(null, employee.id), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Full name" name="fullName" defaultValue={employee.full_name} required error={errors?.fullName} />
        {canChangeEmail && (
          <TextField
            label="Login email"
            name="workEmail"
            type="email"
            defaultValue={employee.work_email}
            required
            hint="They sign in with this. A linked Google account is unlinked when it changes."
            error={errors?.workEmail}
          />
        )}
        <TextField label="Phone" name="phone" type="tel" defaultValue={employee.phone ?? ''} error={errors?.phone} />
        <TextField label="Skills" name="skills" defaultValue={employee.skills.join(', ')} hint="Separate skills with commas." error={errors?.skills} />
        <TextField label="Joining date" name="joiningDate" type="date" defaultValue={employee.joining_date ?? ''} error={errors?.joiningDate} />
        <SelectField label="Employment status" name="employmentStatus" options={employmentStatusOptions} defaultValue={employee.employment_status} error={errors?.employmentStatus} />
        <SelectField
          label="Employment type"
          name="employmentTypeId"
          options={employmentTypes}
          placeholder="Not set"
          defaultValue={employee.employment_type_id ?? ''}
          hint="HR keeps this list in HR settings."
          error={errors?.employmentTypeId}
        />
        <TextField
          label="Probation (months)"
          name="probationMonths"
          type="number"
          min={0}
          max={24}
          defaultValue={employee.probation_months ?? defaultProbationMonths ?? ''}
          hint="From the joining date. 0 means no probation."
          error={errors?.probationMonths}
        />
        <TextField
          label="Confirmation date"
          name="confirmationDate"
          type="date"
          defaultValue={employee.confirmation_date ?? ''}
          hint="When probation was completed."
          error={errors?.confirmationDate}
        />
        {canChangeRole && (
          <SelectField label="Role" name="roleId" options={roles} defaultValue={employee.role_id} error={errors?.roleId} />
        )}
        {canChangeRole && (
          <SearchableMultiSelect
            id="extra-roles"
            name="extraRoleIds"
            label="Additional roles"
            options={roles}
            defaultValue={extraRoleIds}
            hint="For someone who does two jobs. They switch between their roles from the menu under their avatar."
          />
        )}
        <SelectField label="Designation" name="designationId" options={designations} placeholder="None" defaultValue={employee.designation_id ?? ''} error={errors?.designationId} />
        <SelectField
          label="Department"
          name="departmentId"
          options={departments}
          placeholder="None"
          defaultValue={employee.department_id ?? ''}
          disabled={!canTransfer}
          hint={canTransfer ? undefined : 'Transfers need organisation-wide access.'}
          error={errors?.departmentId}
        />
        <SelectField
          label="Reporting manager"
          name="reportingManagerId"
          options={managers.filter((manager) => manager.value !== employee.id)}
          placeholder="None"
          defaultValue={employee.reporting_manager_id ?? ''}
          error={errors?.reportingManagerId}
        />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Save changes" pendingLabel="Saving…" />
        <ButtonLink href={`/people/employees/${employee.id}`} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
