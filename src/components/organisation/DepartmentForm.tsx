'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import {
  FormActions,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { saveDepartmentAction } from '@/server/actions/organisationActions';

type DepartmentFormProps = {
  department?: {
    id: string;
    name: string;
    description: string | null;
    parent_department_id: string | null;
    head_employee_id: string | null;
  };
  departments: SelectOption[];
  employees: SelectOption[];
};

export function DepartmentForm({ department, departments, employees }: DepartmentFormProps) {
  const [result, formAction] = useActionState(saveDepartmentAction.bind(null, department?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" defaultValue={department?.name} required error={errors?.name} />
        <SelectField
          label="Department head"
          name="headEmployeeId"
          options={employees}
          placeholder="None"
          defaultValue={department?.head_employee_id ?? ''}
          error={errors?.headEmployeeId}
        />
        <SelectField
          label="Parent department"
          name="parentDepartmentId"
          options={departments.filter((option) => option.value !== department?.id)}
          placeholder="None"
          defaultValue={department?.parent_department_id ?? ''}
          error={errors?.parentDepartmentId}
        />
      </FormGrid>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TextAreaField label="Description" name="description" defaultValue={department?.description ?? ''} error={errors?.description} />
      </div>
      <FormActions>
        <SubmitButton label={department ? 'Save changes' : 'Add department'} pendingLabel="Saving…" />
        {department && (
          <ButtonLink href="/people/departments" variant="ghost">
            Cancel
          </ButtonLink>
        )}
      </FormActions>
    </KeepValuesForm>
  );
}
