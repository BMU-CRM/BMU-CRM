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
import { priorityLabels } from '@/lib/tasks/taskWorkflow';
import { saveTaskAction } from '@/server/actions/taskActions';

const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

const complexityOptions: SelectOption[] = [
  { value: '1', label: '1 · Very simple' },
  { value: '2', label: '2 · Simple' },
  { value: '3', label: '3 · Moderate' },
  { value: '4', label: '4 · Complex' },
  { value: '5', label: '5 · Very complex' },
];

const recurrenceOptions: SelectOption[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

type TaskFormProps = {
  task?: {
    id: string;
    title: string;
    description: string | null;
    assignee_id: string | null;
    reviewer_id: string | null;
    project_id: string | null;
    client_id: string | null;
    priority: string;
    complexity: number;
    start_date: string | null;
    due_date: string | null;
    estimated_hours: number | null;
    recurrence: string;
    reference_links: string[];
  };
  parentTaskId?: string;
  meetingId?: string;
  defaults?: { projectId?: string; clientId?: string };
  assignees: SelectOption[];
  reviewers: SelectOption[];
  projects: SelectOption[];
  clients: SelectOption[];
  cancelHref: string;
};

export function TaskForm({
  task,
  parentTaskId,
  meetingId,
  defaults,
  assignees,
  reviewers,
  projects,
  clients,
  cancelHref,
}: TaskFormProps) {
  const [result, formAction] = useActionState(
    saveTaskAction.bind(null, task?.id ?? null, parentTaskId ?? null, task ? null : (meetingId ?? null)),
    idleResult,
  );
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Title" name="title" defaultValue={task?.title} required error={errors?.title} />
        <SelectField
          label="Assign to"
          name="assigneeId"
          options={assignees}
          placeholder="Unassigned"
          defaultValue={task?.assignee_id ?? ''}
          hint="Only people you can assign work to are listed."
          error={errors?.assigneeId}
        />
        <SelectField
          label="Reviewer"
          name="reviewerId"
          options={reviewers}
          placeholder="Whoever assigned it"
          defaultValue={task?.reviewer_id ?? ''}
          hint="Signs off the finished work."
          error={errors?.reviewerId}
        />
        <SelectField label="Priority" name="priority" options={priorityOptions} defaultValue={task?.priority ?? 'medium'} error={errors?.priority} />
        <SelectField
          label="Complexity"
          name="complexity"
          options={complexityOptions}
          defaultValue={String(task?.complexity ?? 3)}
          hint="Used for fair workload and performance figures."
          error={errors?.complexity}
        />
        <TextField label="Estimated hours" name="estimatedHours" type="number" min={0} step="0.25" defaultValue={task?.estimated_hours ?? ''} error={errors?.estimatedHours} />
        <TextField label="Start date" name="startDate" type="date" defaultValue={task?.start_date ?? ''} error={errors?.startDate} />
        <TextField label="Due date" name="dueDate" type="date" defaultValue={task?.due_date ?? ''} error={errors?.dueDate} />
        <SelectField
          label="Project"
          name="projectId"
          options={projects}
          placeholder="None"
          defaultValue={task?.project_id ?? defaults?.projectId ?? ''}
          error={errors?.projectId}
        />
        <SelectField
          label="Client"
          name="clientId"
          options={clients}
          placeholder={clients.length > 0 ? 'None' : 'Set by the project'}
          defaultValue={task?.client_id ?? defaults?.clientId ?? ''}
          error={errors?.clientId}
        />
        {!parentTaskId && (
          <SelectField
            label="Repeats"
            name="recurrence"
            options={recurrenceOptions}
            defaultValue={task?.recurrence ?? 'none'}
            hint="The next one is created when this is completed."
            error={errors?.recurrence}
          />
        )}
      </FormGrid>
      {parentTaskId && <input type="hidden" name="recurrence" value="none" />}
      <div className={layout.spaced}>
        <TextAreaField label="Description" name="description" rows={5} defaultValue={task?.description ?? ''} error={errors?.description} />
      </div>
      <div className={layout.spaced}>
        <TextAreaField
          label="Reference links"
          name="referenceLinks"
          defaultValue={task?.reference_links.join('\n') ?? ''}
          hint="One web address per line."
          error={errors?.referenceLinks}
        />
      </div>
      <FormActions>
        <SubmitButton label={task ? 'Save changes' : 'Create task'} pendingLabel="Saving…" />
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
