import { Button, ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import styles from '@/components/ui/ListFilters.module.css';
import { priorityLabels, taskStages, taskStatusLabels } from '@/lib/tasks/taskWorkflow';
import type { TaskView } from '@/server/services/taskService';

type TaskFiltersProps = {
  view: TaskView;
  values: {
    search?: string;
    status?: string;
    stage?: string;
    priority?: string;
    overdue?: boolean;
    assigneeId?: string;
    departmentId?: string;
  };
  // People and departments to look at, for those who oversee others' work.
  oversight?: { people: SelectOption[]; departments: SelectOption[] } | null;
};

const statusOptions = Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }));
const stageOptions = Object.entries(taskStages).map(([value, stage]) => ({ value, label: stage.label }));
const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

export function TaskFilters({ view, values, oversight }: TaskFiltersProps) {
  return (
    <form method="get" className={styles.filters}>
      <input type="hidden" name="view" value={view} />
      <TextField label="Search" name="search" type="search" placeholder="Title or ID" defaultValue={values.search} />
      {oversight && (
        <>
          <SelectField label="Person" name="assignee" options={oversight.people} placeholder="Everyone" defaultValue={values.assigneeId} />
          {oversight.departments.length > 0 && (
            <SelectField
              label="Department"
              name="department"
              options={oversight.departments}
              placeholder="All departments"
              defaultValue={values.departmentId}
            />
          )}
        </>
      )}
      <SelectField label="Progress" name="stage" options={stageOptions} placeholder="Any" defaultValue={values.stage} />
      <SelectField
        label="Status"
        name="status"
        options={statusOptions}
placeholder={view === 'mine' || view === 'assigned' ? 'Open tasks' : 'Any status'}
        defaultValue={values.status}
      />
      <SelectField label="Priority" name="priority" options={priorityOptions} placeholder="All priorities" defaultValue={values.priority} />
      <SelectField
        label="Deadline"
        name="overdue"
        placeholder="Any"
        defaultValue={values.overdue ? '1' : ''}
        options={[{ value: '1', label: 'Overdue only' }]}
      />
      <div className={styles.actions}>
        <Button type="submit">Apply</Button>
        <ButtonLink href={`/tasks?view=${view}`} variant="ghost">
          Clear
        </ButtonLink>
      </div>
    </form>
  );
}
