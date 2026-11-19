// Red flags: work that needs someone to look into it, from get_workload_flags.

export type WorkloadFlagKind = 'overdue' | 'rework' | 'review' | 'idle' | 'attendance';

export type WorkloadFlag = {
  flag_key: string;
  kind: WorkloadFlagKind;
  employee_id: string | null;
  employee_name: string | null;
  task_id: string | null;
  task_title: string | null;
  detail: string;
  since: string | null;
  note: string | null;
  noted_by_name: string | null;
  noted_at: string | null;
};

export const workloadFlagLabels: Record<WorkloadFlagKind, string> = {
  overdue: 'Overdue',
  rework: 'Sent back again and again',
  review: 'Waiting for review',
  idle: 'No activity',
  attendance: 'Attendance and hours differ',
};

const kinds = Object.keys(workloadFlagLabels) as WorkloadFlagKind[];

export function toWorkloadFlag(row: Record<string, unknown>): WorkloadFlag {
  const kind = kinds.includes(row.kind as WorkloadFlagKind) ? (row.kind as WorkloadFlagKind) : 'overdue';
  const text = (key: string) => (row[key] === null || row[key] === undefined ? null : String(row[key]));
  return {
    flag_key: String(row.flag_key ?? ''),
    kind,
    employee_id: text('employee_id'),
    employee_name: text('employee_name'),
    task_id: text('task_id'),
    task_title: text('task_title'),
    detail: String(row.detail ?? ''),
    since: text('since'),
    note: text('note'),
    noted_by_name: text('noted_by_name'),
    noted_at: text('noted_at'),
  };
}

// Open ones (not looked into) first, keeping the database's order within each.
export function sortFlags(flags: WorkloadFlag[]) {
  return [...flags.filter((flag) => !flag.note), ...flags.filter((flag) => flag.note)];
}

// Where a flag leads: its task, or the person's tasks.
export function flagHref(flag: Pick<WorkloadFlag, 'task_id' | 'employee_id'>) {
  if (flag.task_id) return `/tasks/${flag.task_id}`;
  if (flag.employee_id) return `/tasks?view=all&assignee=${flag.employee_id}`;
  return '/tasks';
}
