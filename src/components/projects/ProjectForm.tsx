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
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { projectStatusLabels } from '@/lib/projects/projectHealth';
import { priorityLabels } from '@/lib/tasks/taskWorkflow';
import { saveProjectAction } from '@/server/actions/projectActions';

const statusOptions = Object.entries(projectStatusLabels).map(([value, label]) => ({ value, label }));
const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

type ProjectFormProps = {
  project?: {
    id: string;
    name: string;
    description: string | null;
    client_id: string | null;
    department_id: string | null;
    project_manager_id: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    due_date: string | null;
  };
  defaultClientId?: string;
  clients: SelectOption[];
  departments: SelectOption[];
  managers: SelectOption[];
};

export function ProjectForm({ project, defaultClientId, clients, departments, managers }: ProjectFormProps) {
  const [result, formAction] = useActionState(saveProjectAction.bind(null, project?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Project name" name="name" defaultValue={project?.name} required error={errors?.name} />
        <SelectField
          label="Client"
          name="clientId"
          options={clients}
          placeholder="Internal project"
          defaultValue={project?.client_id ?? defaultClientId ?? ''}
          error={errors?.clientId}
        />
        <SelectField
          label="Lead department"
          name="departmentId"
          options={departments}
          placeholder="None"
          defaultValue={project?.department_id ?? ''}
          error={errors?.departmentId}
        />
        <SelectField
          label="Project manager"
          name="projectManagerId"
          options={managers}
          placeholder={project ? 'None' : 'You'}
          defaultValue={project?.project_manager_id ?? ''}
          error={errors?.projectManagerId}
        />
        <SelectField label="Status" name="status" options={statusOptions} defaultValue={project?.status ?? 'planning'} error={errors?.status} />
        <SelectField label="Priority" name="priority" options={priorityOptions} defaultValue={project?.priority ?? 'medium'} error={errors?.priority} />
        <TextField label="Start date" name="startDate" type="date" defaultValue={project?.start_date ?? ''} error={errors?.startDate} />
        <TextField label="Due date" name="dueDate" type="date" defaultValue={project?.due_date ?? ''} error={errors?.dueDate} />
      </FormGrid>
      <div className={layout.spaced}>
        <TextAreaField label="Description" name="description" rows={4} defaultValue={project?.description ?? ''} error={errors?.description} />
      </div>
      <FormActions>
        <SubmitButton label={project ? 'Save changes' : 'Create project'} pendingLabel="Saving…" />
        <ButtonLink href={project ? `/projects/${project.id}` : '/projects'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
