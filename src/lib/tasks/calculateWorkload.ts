import { isTaskOpen, isTaskOverdue, stageOf, type TaskStage, type TaskStatus, type WorkPriority } from './taskWorkflow';

export const weeklyCapacityHours = 40;

// Used when a task has no estimate, so that unestimated work still counts.
const defaultTaskHours = 4;

const priorityWeights: Record<WorkPriority, number> = { low: 0.8, medium: 1, high: 1.25, urgent: 1.5 };

const overdueWeight = 1.25;
const overloadedAbove = 1;
const underutilisedBelow = 0.4;

export type WorkloadRow = {
  employee_id: string;
  full_name: string;
  department_name: string | null;
  designation_title: string | null;
  task_id: string | null;
  status: TaskStatus | null;
  priority: WorkPriority | null;
  complexity: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  completion_percentage: number | null;
  quality_rating: number | null;
  due_date: string | null;
  completed_at: string | null;
};

export type WorkloadIndicator = 'overloaded' | 'balanced' | 'underutilised';

export type EmployeeWorkload = {
  employeeId: string;
  fullName: string;
  departmentName: string | null;
  designationTitle: string | null;
  activeTasks: number;
  // Open work by where it stands. Done is the last 90 days.
  stageCounts: Record<TaskStage, number>;
  overdueTasks: number;
  remainingHours: number;
  utilisation: number;
  indicator: WorkloadIndicator;
  completedTasks: number;
  complexityPoints: number;
  onTimeRate: number | null;
  averageQuality: number | null;
  hoursAccuracy: number | null;
};

function indicatorFor(utilisation: number): WorkloadIndicator {
  if (utilisation > overloadedAbove) return 'overloaded';
  if (utilisation < underutilisedBelow) return 'underutilised';
  return 'balanced';
}

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Performance deliberately combines complexity, quality, deadlines and hours, so that
// nobody is judged on how many tasks they closed.
export function calculateWorkload(rows: WorkloadRow[], today: string): EmployeeWorkload[] {
  const byEmployee = new Map<string, WorkloadRow[]>();

  for (const row of rows) {
    byEmployee.set(row.employee_id, [...(byEmployee.get(row.employee_id) ?? []), row]);
  }

  const workloads = [...byEmployee.values()].map((employeeRows): EmployeeWorkload => {
    const first = employeeRows[0] as WorkloadRow;
    const tasks = employeeRows.filter((row) => row.task_id !== null && row.status !== null);
    const open = tasks.filter((row) => isTaskOpen(row.status as TaskStatus));
    const completed = tasks.filter((row) => row.status === 'completed');

    let weightedHours = 0;
    let remainingHours = 0;
    let overdueTasks = 0;

    for (const task of open) {
      const left = (task.estimated_hours ?? defaultTaskHours) * (1 - (task.completion_percentage ?? 0) / 100);
      const overdue = isTaskOverdue({ status: task.status as TaskStatus, due_date: task.due_date }, today);

      remainingHours += left;
      weightedHours += left * priorityWeights[task.priority ?? 'medium'] * (overdue ? overdueWeight : 1);
      if (overdue) overdueTasks += 1;
    }

    const stageCounts: Record<TaskStage, number> = { todo: 0, doing: 0, review: 0, done: 0 };
    for (const task of tasks) {
      const stage = stageOf(task.status as TaskStatus);
      if (stage) stageCounts[stage] += 1;
    }

    const withDueDate = completed.filter((task) => task.due_date !== null && task.completed_at !== null);
    const onTime = withDueDate.filter((task) => (task.completed_at as string).slice(0, 10) <= (task.due_date as string));
    const estimated = completed.reduce((sum, task) => sum + (task.estimated_hours ?? 0), 0);
    const actual = completed.reduce((sum, task) => sum + (task.actual_hours ?? 0), 0);
    const utilisation = weightedHours / weeklyCapacityHours;

    return {
      employeeId: first.employee_id,
      fullName: first.full_name,
      departmentName: first.department_name,
      designationTitle: first.designation_title,
      activeTasks: open.length,
      stageCounts,
      overdueTasks,
      remainingHours,
      utilisation,
      indicator: indicatorFor(utilisation),
      completedTasks: completed.length,
      complexityPoints: completed.reduce((sum, task) => sum + (task.complexity ?? 0), 0),
      onTimeRate: withDueDate.length === 0 ? null : onTime.length / withDueDate.length,
      averageQuality: average(completed.flatMap((task) => (task.quality_rating === null ? [] : [task.quality_rating]))),
      hoursAccuracy: estimated > 0 && actual > 0 ? estimated / actual : null,
    };
  });

  return workloads.sort((first, second) => second.utilisation - first.utilisation);
}

export function summariseByDepartment(workloads: EmployeeWorkload[]) {
  const departments = new Map<string, EmployeeWorkload[]>();

  for (const workload of workloads) {
    const name = workload.departmentName ?? 'No department';
    departments.set(name, [...(departments.get(name) ?? []), workload]);
  }

  return [...departments.entries()]
    .map(([department, members]) => ({
      department,
      people: members.length,
      activeTasks: members.reduce((sum, member) => sum + member.activeTasks, 0),
      stageCounts: {
        todo: members.reduce((sum, member) => sum + member.stageCounts.todo, 0),
        doing: members.reduce((sum, member) => sum + member.stageCounts.doing, 0),
        review: members.reduce((sum, member) => sum + member.stageCounts.review, 0),
        done: members.reduce((sum, member) => sum + member.stageCounts.done, 0),
      },
      overdueTasks: members.reduce((sum, member) => sum + member.overdueTasks, 0),
      utilisation: members.reduce((sum, member) => sum + member.utilisation, 0) / members.length,
    }))
    .sort((first, second) => second.utilisation - first.utilisation);
}
