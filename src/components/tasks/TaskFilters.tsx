import { Button, ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/FormFields';
import styles from '@/components/ui/ListFilters.module.css';
import { priorityLabels, taskStatusLabels } from '@/lib/tasks/taskWorkflow';
import type { TaskView } from '@/server/services/taskService';

type TaskFiltersProps = {
  view: TaskView;
  values: { search?: string; status?: string; priority?: string; overdue?: boolean };
};

const statusOptions = Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }));
const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

export function TaskFilters({ view, values }: TaskFiltersProps) {
  return (
    <form method="get" className={styles.filters}>
      <input type="hidden" name="view" value={view} />
      <TextField label="Search" name="search" type="search" placeholder="Title or ID" defaultValue={values.search} />
      <SelectField label="Status" name="status" options={statusOptions} placeholder="Open tasks" defaultValue={values.status} />
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
