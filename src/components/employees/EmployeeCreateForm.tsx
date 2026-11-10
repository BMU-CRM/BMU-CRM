'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { createEmployeeAction } from '@/server/actions/employeeActions';

type EmployeeCreateFormProps = {
  roles: SelectOption[];
  // Set when the person adding cannot choose roles. New people get this role.
  fixedRoleName: string | null;
  designations: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
  isTeamOnly: boolean;
  defaultManagerId?: string;
};

export function EmployeeCreateForm({
  roles,
  fixedRoleName,
  designations,
  departments,
  managers,
  isTeamOnly,
  defaultManagerId,
}: EmployeeCreateFormProps) {
  const [result, formAction] = useActionState(createEmployeeAction, idleResult);
  const errors = result.fieldErrors;
  const singleDepartment = departments.length === 1 ? departments[0] : undefined;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Full name" name="fullName" required error={errors?.fullName} />
        <TextField label="Work email" name="workEmail" type="email" required error={errors?.workEmail} hint="They sign in with this." />
        <TextField label="Phone" name="phone" type="tel" error={errors?.phone} />
        <TextField label="Joining date" name="joiningDate" type="date" error={errors?.joiningDate} />
        {fixedRoleName === null ? (
          <SelectField label="Role" name="roleId" options={roles} placeholder="Choose a role" required error={errors?.roleId} hint="Decides what they can see and do." />
        ) : (
          <div className={formStyles.field}>
            <span className={formStyles.label}>Role</span>
            <p>{fixedRoleName}</p>
            <p className={formStyles.hint}>People you add get this role. An administrator can change it later.</p>
          </div>
        )}
        <SelectField label="Designation" name="designationId" options={designations} placeholder="None" error={errors?.designationId} />
        <SelectField
          label="Department"
          name="departmentId"
          options={departments}
          placeholder={singleDepartment ? undefined : 'None'}
          defaultValue={singleDepartment?.value}
          error={errors?.departmentId}
        />
        <SelectField
          label="Reporting manager"
          name="reportingManagerId"
          options={managers}
          placeholder={isTeamOnly ? undefined : 'None'}
          defaultValue={defaultManagerId}
          required={isTeamOnly}
          hint={isTeamOnly ? 'You, or someone in your team.' : undefined}
          error={errors?.reportingManagerId}
        />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Add employee" pendingLabel="Adding…" />
        <ButtonLink href="/people/employees" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
