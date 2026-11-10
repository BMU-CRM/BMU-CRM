'use client';

import { useActionState } from 'react';
import hrStyles from '@/components/hr/HrForms.module.css';
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
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { priorityLabels } from '@/lib/tasks/taskWorkflow';
import { raiseTicketAction, saveTicketCategoryAction, saveTicketHandlingAction } from '@/server/actions/ticketActions';

const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

type CategoryOption = SelectOption & { description: string | null };

export function RaiseTicketForm({ categories }: { categories: CategoryOption[] }) {
  const [result, formAction] = useActionState(raiseTicketAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField
          label="Category"
          name="categoryId"
          options={categories.map((category) => ({
            value: category.value,
            label: category.description ? `${category.label}: ${category.description}` : category.label,
          }))}
          placeholder="Choose what it is about"
          required
          error={errors?.categoryId}
        />
        <SelectField label="Priority" name="priority" options={priorityOptions} defaultValue="medium" error={errors?.priority} />
      </FormGrid>
      <div className={layout.spaced}>
        <TextField label="Summary" name="title" required placeholder="For example: Laptop will not connect to Wi-Fi" error={errors?.title} />
      </div>
      <div className={layout.spaced}>
        <TextAreaField
          label="Details"
          name="description"
          rows={6}
          required
          hint="What happened, what you expected, and anything you have already tried. You can attach files after sending."
          error={errors?.description}
        />
      </div>
      <FormActions>
        <SubmitButton label="Send ticket" pendingLabel="Sending…" />
        <ButtonLink href="/tickets" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type HandlingFormProps = {
  ticketId: string;
  assignedTo: string | null;
  priority: string;
  handlers: SelectOption[];
};

export function TicketHandlingForm({ ticketId, assignedTo, priority, handlers }: HandlingFormProps) {
  const [result, formAction] = useActionState(saveTicketHandlingAction.bind(null, ticketId), idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <SelectField
        label="Handled by"
        name="assignedTo"
        options={handlers}
        placeholder="Not assigned"
        defaultValue={assignedTo ?? ''}
        error={result.fieldErrors?.assignedTo}
      />
      <div className={layout.spaced}>
        <SelectField label="Priority" name="priority" id="handling-priority" options={priorityOptions} defaultValue={priority} />
      </div>
      <FormActions>
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}

type CategoryFormProps = {
  category?: {
    id: string;
    name: string;
    description: string | null;
    handling_department_id: string | null;
    default_assignee_id: string | null;
    is_active: boolean;
  };
  departments: SelectOption[];
  people: SelectOption[];
};

export function TicketCategoryForm({ category, departments, people }: CategoryFormProps) {
  const [result, formAction] = useActionState(saveTicketCategoryAction.bind(null, category?.id ?? null), idleResult);
  const prefix = category?.id ?? 'new';
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction} key={!category && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <div className={hrStyles.inline}>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={category?.name} required error={errors?.name} />
        <TextField label="Description" name="description" id={`${prefix}-description`} defaultValue={category?.description ?? ''} error={errors?.description} />
        <SelectField
          label="Handled by"
          name="handlingDepartmentId"
          id={`${prefix}-department`}
          options={departments}
          placeholder="Choose a department"
          defaultValue={category?.handling_department_id ?? ''}
          error={errors?.handlingDepartmentId}
        />
        <SelectField
          label="Goes straight to"
          name="defaultAssigneeId"
          id={`${prefix}-assignee`}
          options={people}
          placeholder="The department head decides"
          defaultValue={category?.default_assignee_id ?? ''}
          error={errors?.defaultAssigneeId}
        />
        {category && (
          <label className={hrStyles.check}>
            <input type="checkbox" name="isActive" defaultChecked={category.is_active} /> Available
          </label>
        )}
        <SubmitButton label={category ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}
