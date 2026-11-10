'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
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
    phone: string | null;
    joining_date: string | null;
    employment_status: string;
    role_id: string;
    designation_id: string | null;
    department_id: string | null;
    reporting_manager_id: string | null;
  };
  roles: SelectOption[];
  designations: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  canTransfer: boolean;
  canChangeRole: boolean;
};

export function EmployeeEditForm({
  employee,
  roles,
  designations,
  departments,
  managers,
  canTransfer,
  canChangeRole,
}: EmployeeEditFormProps) {
  const [result, formAction] = useActionState(updateEmployeeAction.bind(null, employee.id), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Full name" name="fullName" defaultValue={employee.full_name} required error={errors?.fullName} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={employee.phone ?? ''} error={errors?.phone} />
        <TextField label="Joining date" name="joiningDate" type="date" defaultValue={employee.joining_date ?? ''} error={errors?.joiningDate} />
        <SelectField label="Employment status" name="employmentStatus" options={employmentStatusOptions} defaultValue={employee.employment_status} error={errors?.employmentStatus} />
        {canChangeRole && (
          <SelectField label="Role" name="roleId" options={roles} defaultValue={employee.role_id} error={errors?.roleId} />
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
