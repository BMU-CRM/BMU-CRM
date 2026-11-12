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
    dueFrom?: string;
    dueTo?: string;
    assigneeId?: string;
    creatorId?: string;
    departmentId?: string;
  };
  // People and departments to look at, for those who oversee others' work.
  oversight?: { people: SelectOption[]; departments: SelectOption[] } | null;
  // Who may have given the tasks, for the "Assigned by" filter. Left out on "Assigned by
  // me", where it is always the person themselves.
  creators?: SelectOption[];
};

const statusOptions = Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }));
const stageOptions = Object.entries(taskStages).map(([value, stage]) => ({ value, label: stage.label }));
const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

export function TaskFilters({ view, values, oversight, creators }: TaskFiltersProps) {
  return (
    <form method="get" className={styles.filters}>
      <input type="hidden" name="view" value={view} />
      <TextField label="Search" name="search" type="search" placeholder="Title or ID" defaultValue={values.search} />
      {oversight && (
        <>
          <SelectField label="Assigned to" name="assignee" options={oversight.people} placeholder="Everyone" defaultValue={values.assigneeId} />
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
      {creators && <SelectField label="Assigned by" name="creator" options={creators} placeholder="Anyone" defaultValue={values.creatorId} />}
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
      <TextField label="Due from" name="dueFrom" type="date" defaultValue={values.dueFrom} />
      <TextField label="Due to" name="dueTo" type="date" defaultValue={values.dueTo} />
      <div className={styles.actions}>
        <Button type="submit">Apply</Button>
        <ButtonLink href={`/tasks?view=${view}`} variant="ghost">
          Clear
        </ButtonLink>
      </div>
    </form>
  );
}
