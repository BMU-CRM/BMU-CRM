// The figures of a day or week workload report, as the page, the CSV file and a sent
// report all show them. One row per person, from get_workload_activity.

import { csvCell } from '@/lib/csv/csvCell';

export type WorkloadActivity = {
  employee_id: string;
  full_name: string;
  department_name: string | null;
  designation_title: string | null;
  assigned: number;
  started: number;
  submitted: number;
  sent_back: number;
  approved: number;
  completed_late: number;
  hours_worked: number;
  yet_to_start: number;
  in_progress: number;
  waiting_review: number;
  overdue: number;
};

export type WorkloadCount = Exclude<keyof WorkloadActivity, 'employee_id' | 'full_name' | 'department_name' | 'designation_title'>;

// In this order on the page and in the file.
export const workloadCountColumns: { key: WorkloadCount; heading: string; part: 'activity' | 'end' }[] = [
  { key: 'assigned', heading: 'Assigned', part: 'activity' },
  { key: 'started', heading: 'Started', part: 'activity' },
  { key: 'submitted', heading: 'Submitted for review', part: 'activity' },
  { key: 'sent_back', heading: 'Sent back for rework', part: 'activity' },
  { key: 'approved', heading: 'Approved or completed', part: 'activity' },
  { key: 'completed_late', heading: 'Completed late', part: 'activity' },
  { key: 'hours_worked', heading: 'Hours worked', part: 'activity' },
  { key: 'yet_to_start', heading: 'Yet to start', part: 'end' },
  { key: 'in_progress', heading: 'Being worked on', part: 'end' },
  { key: 'waiting_review', heading: 'Waiting for review', part: 'end' },
  { key: 'overdue', heading: 'Overdue', part: 'end' },
];

// The database sends numbers as numbers or strings; the report keeps numbers.
export function toWorkloadActivity(row: Record<string, unknown>): WorkloadActivity {
  const number = (key: string) => Number(row[key] ?? 0) || 0;
  return {
    employee_id: String(row.employee_id ?? ''),
    full_name: String(row.full_name ?? ''),
    department_name: (row.department_name as string | null) ?? null,
    designation_title: (row.designation_title as string | null) ?? null,
    ...(Object.fromEntries(workloadCountColumns.map((column) => [column.key, number(column.key)])) as Record<WorkloadCount, number>),
  };
}

function sum(rows: WorkloadActivity[], key: WorkloadCount) {
  const total = rows.reduce((running, row) => running + row[key], 0);
  return key === 'hours_worked' ? Math.round(total * 100) / 100 : total;
}

export function workloadTotals(rows: WorkloadActivity[]) {
  return Object.fromEntries(workloadCountColumns.map((column) => [column.key, sum(rows, column.key)])) as Record<WorkloadCount, number>;
}

// Each department's totals, busiest (most hours) first.
export function workloadByDepartment(rows: WorkloadActivity[]) {
  const groups = new Map<string, WorkloadActivity[]>();
  for (const row of rows) {
    const name = row.department_name ?? 'No department';
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([department, members]) => ({ department, people: members.length, totals: workloadTotals(members) }))
    .sort((first, second) => second.totals.hours_worked - first.totals.hours_worked || first.department.localeCompare(second.department));
}

// "4.5 h", "0 h".
export function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, '')} h`;
}

const cell = (key: WorkloadCount, value: number) => (key === 'hours_worked' ? csvCell(value) : String(value));

// The CSV header and rows: each person, then a total line.
export function workloadCsv(rows: WorkloadActivity[]) {
  const header = ['Employee', 'Department', 'Designation', ...workloadCountColumns.map((column) => column.heading)];
  const totals = workloadTotals(rows);
  return {
    header,
    rows: [
      ...rows.map((row) => [
        csvCell(row.full_name),
        csvCell(row.department_name ?? 'No department'),
        csvCell(row.designation_title),
        ...workloadCountColumns.map((column) => cell(column.key, row[column.key])),
      ]),
      [csvCell('Total'), csvCell(`${rows.length} people`), '', ...workloadCountColumns.map((column) => cell(column.key, totals[column.key]))],
    ],
  };
}
